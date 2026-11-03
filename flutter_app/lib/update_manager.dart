import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

class MelodiyaUpdateRequests {
  static final StreamController<void> _requests =
      StreamController<void>.broadcast();

  static Stream<void> get stream => _requests.stream;

  static void checkNow() => _requests.add(null);
}

class MelodiyaUpdateManager extends StatefulWidget {
  const MelodiyaUpdateManager({required this.child, super.key});

  final Widget child;

  @override
  State<MelodiyaUpdateManager> createState() => _MelodiyaUpdateManagerState();
}

class _MelodiyaUpdateManagerState extends State<MelodiyaUpdateManager>
    with WidgetsBindingObserver {
  static const String _manifestUrl =
      'https://xdtgtwlpkgldszmufoay.supabase.co/storage/v1/object/public/melodiya-app-updates/version.json';
  static const String _appId = 'com.melodiya.melodiya_app';
  static const Duration _checkInterval = Duration(hours: 12);
  static const int _maxApkBytes = 100 * 1024 * 1024;

  bool _checking = false;
  bool _downloading = false;
  bool _dialogOpen = false;
  DateTime? _lastCheck;
  Map<String, dynamic>? _availableUpdate;
  StreamSubscription<void>? _requestSubscription;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _requestSubscription = MelodiyaUpdateRequests.stream.listen((_) {
      unawaited(_checkForUpdates(userInitiated: true));
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_checkForUpdates());
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed || _checking || _downloading) return;
    final last = _lastCheck;
    if (last == null || DateTime.now().difference(last) >= _checkInterval) {
      unawaited(_checkForUpdates());
    }
  }

  void _showStatus(String message) {
    if (!mounted) return;
    final messenger = ScaffoldMessenger.maybeOf(context);
    if (messenger == null) return;
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _checkForUpdates({bool userInitiated = false}) async {
    if (_checking || _downloading) return;
    _checking = true;
    _lastCheck = DateTime.now();

    try {
      final packageInfo = await PackageInfo.fromPlatform();
      if (packageInfo.packageName != _appId) {
        if (userInitiated) _showStatus('This update is not for this app.');
        return;
      }

      final manifestUri = Uri.parse(_manifestUrl).replace(
        queryParameters: {
          't': DateTime.now().millisecondsSinceEpoch.toString(),
        },
      );
      final response = await http.get(
        manifestUri,
        headers: const {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      ).timeout(const Duration(seconds: 20));

      if (response.statusCode != HttpStatus.ok) {
        if (userInitiated) _showStatus('Could not check for updates. Please try again.');
        return;
      }

      final decoded = jsonDecode(response.body);
      if (decoded is! Map) {
        if (userInitiated) _showStatus('The update information is invalid.');
        return;
      }

      final manifest = Map<String, dynamic>.from(decoded);
      if (manifest['appId'] != _appId) {
        if (userInitiated) _showStatus('The update is for a different app.');
        return;
      }

      final latestBuild = int.tryParse(manifest['buildNumber']?.toString() ?? '');
      final currentBuild = int.tryParse(packageInfo.buildNumber) ?? 0;
      final apkUri = Uri.tryParse(manifest['apkUrl']?.toString() ?? '');
      final checksum = manifest['sha256']?.toString().toLowerCase() ?? '';
      final checksumIsValid = RegExp(r'^[a-f0-9]{64}$').hasMatch(checksum);

      if (latestBuild == null || apkUri == null ||
          apkUri.scheme != 'https' || !checksumIsValid) {
        if (userInitiated) _showStatus('Could not verify the update information.');
        return;
      }

      if (latestBuild <= currentBuild) {
        if (userInitiated) _showStatus('You are using the latest version of Sonora.');
        return;
      }

      if (!mounted) return;
      setState(() => _availableUpdate = manifest);
      await _showUpdateDialog(manifest, currentBuild);
    } catch (_) {
      if (userInitiated) {
        _showStatus('Could not check for updates. Check your internet connection.');
      }
    } finally {
      _checking = false;
    }
  }

  Future<void> _showUpdateDialog(
    Map<String, dynamic> manifest, [
    int? currentBuild,
  ]) async {
    if (!mounted || _dialogOpen || _downloading) return;
    _dialogOpen = true;

    final version = manifest['version']?.toString() ?? 'Latest';
    final buildNumber = manifest['buildNumber']?.toString() ?? '';
    final notes = manifest['releaseNotes']?.toString().trim() ?? '';
    final mandatory = manifest['mandatory'] == true;

    try {
      await showDialog<void>(
        context: context,
        barrierDismissible: !mandatory,
        builder: (dialogContext) => AlertDialog(
          icon: const Icon(
            Icons.system_update_rounded,
            color: Color(0xFFA855F7),
            size: 34,
          ),
          title: const Text('Sonora update available'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Version ' + version + ' (build ' + buildNumber + ') is ready.'),
              if (currentBuild != null) ...[
                const SizedBox(height: 6),
                Text(
                  'Installed build: ' + currentBuild.toString(),
                  style: const TextStyle(color: Colors.white60, fontSize: 12),
                ),
              ],
              if (notes.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(notes),
              ],
              const SizedBox(height: 12),
              const Text(
                'The APK will be verified before Android opens its installer.',
                style: TextStyle(color: Colors.white54, fontSize: 12),
              ),
            ],
          ),
          actions: [
            if (!mandatory)
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('Later'),
              ),
            FilledButton.icon(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                unawaited(_downloadAndInstall(manifest));
              },
              icon: const Icon(Icons.download_rounded),
              label: const Text('Update now'),
            ),
          ],
        ),
      );
    } finally {
      _dialogOpen = false;
    }
  }

  Future<void> _downloadAndInstall(Map<String, dynamic> manifest) async {
    if (_downloading || !Platform.isAndroid) return;

    final apkUri = Uri.tryParse(manifest['apkUrl']?.toString() ?? '');
    final expectedHash = manifest['sha256']?.toString().toLowerCase() ?? '';
    final buildNumber = manifest['buildNumber']?.toString() ?? 'latest';

    if (apkUri == null || apkUri.scheme != 'https' ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(expectedHash)) {
      _showStatus('The update could not be verified.');
      return;
    }

    setState(() => _downloading = true);
    final messenger = ScaffoldMessenger.of(context);
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(const SnackBar(
        duration: Duration(minutes: 4),
        content: Text('Downloading Sonora update…'),
      ));

    final client = http.Client();
    File? apkFile;

    try {
      final directory = await getTemporaryDirectory();
      apkFile = File(directory.path + '/melodiya-update-' + buildNumber + '.apk');
      if (await apkFile.exists()) await apkFile.delete();

      final response = await client.send(http.Request('GET', apkUri))
          .timeout(const Duration(minutes: 3));

      if (response.statusCode != HttpStatus.ok) {
        throw HttpException('APK download failed (HTTP ' + response.statusCode.toString() + ').');
      }
      if (response.contentLength != null && response.contentLength! > _maxApkBytes) {
        throw const FormatException('The APK is larger than allowed.');
      }

      final sink = apkFile.openWrite();
      var receivedBytes = 0;
      try {
        await for (final chunk in response.stream.timeout(const Duration(minutes: 4))) {
          receivedBytes += chunk.length;
          if (receivedBytes > _maxApkBytes) {
            throw const FormatException('The APK is larger than allowed.');
          }
          sink.add(chunk);
        }
        await sink.flush();
      } finally {
        await sink.close();
      }

      if (receivedBytes == 0) throw const FormatException('The downloaded APK is empty.');
      final actualHash = sha256.convert(await apkFile.readAsBytes()).toString();
      if (actualHash != expectedHash) {
        throw const FormatException('APK checksum mismatch. The update was not installed.');
      }

      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(const SnackBar(
          content: Text('Download verified. Opening Android installer…'),
        ));

      final result = await OpenFilex.open(
        apkFile.path,
        type: 'application/vnd.android.package-archive',
      );
      if (result.type != ResultType.done) throw StateError(result.message);
    } catch (error) {
      if (apkFile != null && await apkFile.exists()) {
        try {
          await apkFile.delete();
        } catch (_) {}
      }
      if (mounted) {
        messenger
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(
            content: Text('Could not install update: ' + error.toString()),
          ));
      }
    } finally {
      client.close();
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _requestSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,
        if (_availableUpdate != null && !_downloading)
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            right: 12,
            child: SafeArea(
              child: FilledButton.tonalIcon(
                onPressed: () => unawaited(_showUpdateDialog(_availableUpdate!)),
                icon: const Icon(Icons.system_update_alt_rounded, size: 18),
                label: const Text('Update'),
              ),
            ),
          ),
      ],
    );
  }
}
