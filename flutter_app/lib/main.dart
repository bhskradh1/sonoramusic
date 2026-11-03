import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'update_manager.dart';
import 'package:flutter/services.dart';
import 'package:audio_service/audio_service.dart';
import 'package:just_audio/just_audio.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

const _appName = 'Sonora';
const _port = 43110;
const _origin = 'http://127.0.0.1:$_port';
late _MelodiyaAudioHandler _audioHandler;

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Color(0xFF080909),
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Color(0xFF080909),
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  _audioHandler = await AudioService.init(
    builder: _MelodiyaAudioHandler.new,
    config: const AudioServiceConfig(
      androidNotificationChannelId: 'com.melodiya.melodiya_app.audio',
      androidNotificationChannelName: 'Sonora playback',
      androidNotificationChannelDescription: 'Now playing controls for Sonora',
      androidNotificationOngoing: true,
    ),
  ) as _MelodiyaAudioHandler;
  runApp(const MelodiyaApp());
}

class _MelodiyaAudioHandler extends BaseAudioHandler with QueueHandler, SeekHandler {
  Future<void> Function(String action)? onMediaAction;
  bool _foreground = true;
  bool _hasTrack = false;

  void updateTrack({
    required String videoId,
    required String title,
    required String artist,
    required String artworkUrl,
    required bool playing,
  }) {
    if (!_foreground || videoId.isEmpty) return;
    _hasTrack = true;
    final artwork = Uri.tryParse(artworkUrl);
    mediaItem.add(MediaItem(
      id: 'youtube:$videoId',
      album: 'Sonora · YouTube',
      title: title.isEmpty ? 'Unknown track' : title,
      artist: artist.isEmpty ? 'Unknown artist' : artist,
      artUri: artwork != null && (artwork.scheme == 'https' || artwork.scheme == 'http')
          ? artwork
          : null,
    ));
    _publish(playing: playing);
  }

  void updatePlaying(bool playing) {
    if (!_foreground || !_hasTrack) return;
    _publish(playing: playing);
  }

  void setAppForeground(bool foreground) {
    _foreground = foreground;
    if (_hasTrack) _publish(playing: false, controlsEnabled: foreground);
  }

  void clear() {
    _hasTrack = false;
    mediaItem.add(null);
    playbackState.add(PlaybackState(
      processingState: AudioProcessingState.idle,
      playing: false,
    ));
  }

  void _publish({required bool playing, bool controlsEnabled = true}) {
    final controls = controlsEnabled
        ? <MediaControl>[
            MediaControl.skipToPrevious,
            playing ? MediaControl.pause : MediaControl.play,
            MediaControl.skipToNext,
          ]
        : <MediaControl>[];
    playbackState.add(PlaybackState(
      controls: controls,
      androidCompactActionIndices: controlsEnabled ? const [0, 1, 2] : const [],
      processingState: AudioProcessingState.ready,
      playing: playing,
      updatePosition: Duration.zero,
      bufferedPosition: Duration.zero,
      speed: 1.0,
    ));
  }

  @override
  Future<void> play() async {
    if (!_foreground || !_hasTrack) return;
    await onMediaAction?.call('play');
    _publish(playing: true);
  }

  @override
  Future<void> pause() async {
    if (!_foreground || !_hasTrack) return;
    await onMediaAction?.call('pause');
    _publish(playing: false);
  }

  @override
  Future<void> skipToNext() async {
    if (!_foreground || !_hasTrack) return;
    await onMediaAction?.call('next');
  }

  @override
  Future<void> skipToPrevious() async {
    if (!_foreground || !_hasTrack) return;
    await onMediaAction?.call('previous');
  }

  @override
  Future<void> stop() async {
    if (_foreground && _hasTrack) await onMediaAction?.call('pause');
    clear();
  }

  @override
  Future<void> onNotificationDeleted() async => clear();
}

class MelodiyaApp extends StatelessWidget {
  const MelodiyaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: _appName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF080909),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFD4D4D8),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const MelodiyaUpdateManager(child: _MelodiyaHome()),
    );
  }
}

class _MelodiyaHome extends StatefulWidget {
  const _MelodiyaHome();

  @override
  State<_MelodiyaHome> createState() => _MelodiyaHomeState();
}

class _MelodiyaHomeState extends State<_MelodiyaHome> with WidgetsBindingObserver {
  late final WebViewController _web;
  late final AudioPlayer _nativeAudioPlayer;
  StreamSubscription? _nativePlayerStateSubscription;
  StreamSubscription? _nativeErrorSubscription;
  Timer? _nativeStateTimer;
  bool _nativeAudioActive = false;
  bool _nativeEndedNotified = false;
  bool _nativeRequestedPlaying = false;
  String? _activeNativeUrl;
  DateTime? _lastWebAudioCommandAt;
  HttpServer? _server;
  bool _loading = true;
  bool _canGoBack = false;
  bool _appForeground = true;
  bool _notificationPermissionRequested = false;
  String? _error;
  int _progress = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _audioHandler.onMediaAction = _dispatchNativeMediaAction;
    _nativeAudioPlayer = AudioPlayer();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF080909))
      ..addJavaScriptChannel(
        'MelodiyaBridge',
        onMessageReceived: (message) {
          final value = message.message == 'true';
          if (mounted && value != _canGoBack) {
            setState(() => _canGoBack = value);
          }
        },
      )
      ..addJavaScriptChannel(
        'MelodiyaNativeAudio',
        onMessageReceived: (message) {
          unawaited(_handleNativeAudioMessage(message.message));
        },
      )
      ..addJavaScriptChannel(
        'MelodiyaNativeMedia',
        onMessageReceived: (message) {
          unawaited(_handleNativeMediaMessage(message.message));
        },
      )
      ..addJavaScriptChannel(
        'MelodiyaUpdateBridge',
        onMessageReceived: (_) => MelodiyaUpdateRequests.checkNow(),
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (progress) {
            if (!mounted) return;
            setState(() {
              _progress = progress;
              _loading = progress < 100;
            });
          },
          onPageStarted: (_) {
            if (mounted) setState(() => _loading = true);
          },
          onPageFinished: (_) {
            if (!mounted) return;
            setState(() {
              _loading = false;
              _progress = 100;
              _error = null;
            });
            unawaited(_installHistoryBridge());
          },
          onWebResourceError: (error) {
            if (error.isForMainFrame == true && mounted) {
              setState(() {
                _loading = false;
                _error = error.description;
              });
            }
          },
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            if (uri == null) return NavigationDecision.prevent;

            final local = uri.scheme == 'http' &&
                uri.host == '127.0.0.1' &&
                uri.port == _port;
            if (local) return NavigationDecision.navigate;

            // Keep the bundled app on its own origin; open external links safely.
            unawaited(_openExternal(uri));
            return NavigationDecision.prevent;
          },
        ),
      );
    _nativePlayerStateSubscription = _nativeAudioPlayer.playerStateStream.listen((state) {
      if (!_nativeAudioActive) return;
      if (state.processingState == ProcessingState.completed) {
        if (!_nativeEndedNotified) {
          _nativeEndedNotified = true;
          _publishNativeAudioState(event: 'ended');
        }
      } else {
        _publishNativeAudioState();
      }
    });
    _nativeErrorSubscription = _nativeAudioPlayer.errorStream.listen((error) {
      if (_nativeAudioActive) _publishNativeAudioState(event: 'error', message: error.toString());
    });
    _nativeStateTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_nativeAudioActive) _publishNativeAudioState();
    });
    unawaited(_start());
  }

  Future<void> _start() async {
    try {
      _server = await HttpServer.bind(
        InternetAddress.loopbackIPv4,
        _port,
        shared: false,
      );
      _server!.listen(_serveAsset, onError: (Object error) {
        if (mounted) setState(() => _error = 'Local server error: $error');
      });

      final platform = _web.platform;
      if (platform is AndroidWebViewController) {
        await platform.setMediaPlaybackRequiresUserGesture(false);
      }

      await _web.loadRequest(Uri.parse('$_origin/'));
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not start the bundled app: $error';
      });
    }
  }

  Future<void> _handleNativeAudioMessage(String rawMessage) async {
    try {
      final decoded = jsonDecode(rawMessage);
      if (decoded is! Map) return;
      final message = Map<String, dynamic>.from(decoded);
      final command = message['command'] as String?;
      if (command == null) return;
      _lastWebAudioCommandAt = DateTime.now();

      switch (command) {
        case 'load':
          final rawUrl = message['url'] as String?;
          final uri = rawUrl == null ? null : Uri.tryParse(rawUrl);
          if (uri == null || uri.scheme != 'https' || !uri.hasAuthority) {
            throw const FormatException('Native playback requires a direct HTTPS audio URL.');
          }
          final title = (message['title'] as String?)?.trim();
          final artist = (message['artist'] as String?)?.trim();
          final rawArtwork = message['artwork'] as String?;
          final parsedArtwork = rawArtwork == null ? null : Uri.tryParse(rawArtwork);
          final artworkUri = parsedArtwork != null &&
                  (parsedArtwork.scheme == 'https' || parsedArtwork.scheme == 'http')
              ? parsedArtwork
              : null;

          _nativeAudioActive = true;
          _nativeEndedNotified = false;
          _activeNativeUrl = uri.toString();
          _nativeRequestedPlaying = message['autoplay'] == true;
          await _nativeAudioPlayer.setAudioSource(
            AudioSource.uri(
              uri,
              tag: MediaItem(
                id: uri.toString(),
                album: 'Sonora',
                title: title == null || title.isEmpty ? 'Unknown track' : title,
                artist: artist == null || artist.isEmpty ? 'Unknown artist' : artist,
                artUri: artworkUri,
              ),
            ),
          );
          if (_nativeRequestedPlaying) {
            unawaited(_nativeAudioPlayer.play().catchError((Object error) {
              _publishNativeAudioState(event: 'error', message: error.toString());
            }));
          }
          _publishNativeAudioState();
          break;

        case 'play':
          if (_activeNativeUrl != null) {
            _nativeRequestedPlaying = true;
            unawaited(_nativeAudioPlayer.play().catchError((Object error) {
              _publishNativeAudioState(event: 'error', message: error.toString());
            }));
          }
          break;

        case 'pause':
          _nativeRequestedPlaying = false;
          await _nativeAudioPlayer.pause();
          _publishNativeAudioState();
          break;

        case 'stop':
          _nativeRequestedPlaying = false;
          _nativeAudioActive = false;
          _activeNativeUrl = null;
          await _nativeAudioPlayer.stop();
          _publishNativeAudioState(event: 'stopped', force: true);
          break;

        case 'seek':
          final rawPosition = message['position'];
          if (rawPosition is num) {
            await _nativeAudioPlayer.seek(
              Duration(milliseconds: (rawPosition.clamp(0, 86400) * 1000).round()),
            );
          }
          _publishNativeAudioState();
          break;

        case 'volume':
          final rawVolume = message['volume'];
          if (rawVolume is num) {
            await _nativeAudioPlayer.setVolume(
              rawVolume.toDouble().clamp(0.0, 1.0).toDouble(),
            );
          }
          break;
      }
    } catch (error) {
      _publishNativeAudioState(event: 'error', message: error.toString(), force: true);
    }
  }

  void _publishNativeAudioState({String? event, String? message, bool force = false}) {
    if (!force && !_nativeAudioActive) return;
    final playerState = _nativeAudioPlayer.playerState;
    final lastCommand = _lastWebAudioCommandAt;
    final syncPlaying = lastCommand == null ||
        DateTime.now().difference(lastCommand) > const Duration(seconds: 2);
    final payload = <String, dynamic>{
      'event': event ?? 'state',
      'playing': playerState.playing,
      'position': _nativeAudioPlayer.position.inMilliseconds / 1000.0,
      'duration': (_nativeAudioPlayer.duration?.inMilliseconds ?? 0) / 1000.0,
      'processingState': playerState.processingState.name,
      'syncPlaying': syncPlaying,
    };
    if (message != null) payload['message'] = message;
    final script =
        'window.dispatchEvent(new CustomEvent("melodiya-native-audio-state", {detail: ${jsonEncode(payload)}}));';
    unawaited(_web.runJavaScript(script).catchError((_) {}));
  }

  Future<void> _serveAsset(HttpRequest request) async {
    final response = request.response;
    if (request.method != 'GET' && request.method != 'HEAD') {
      response.statusCode = HttpStatus.methodNotAllowed;
      await response.close();
      return;
    }

    final path = request.uri.path;
    if (path.split('/').contains('..') || path.contains(r'\\')) {
      response.statusCode = HttpStatus.forbidden;
      await response.close();
      return;
    }

    var name = path == '/' ? 'index.html' : path.substring(1);
    ByteData bytes;
    try {
      bytes = await rootBundle.load('assets/web/$name');
    } on FlutterError {
      // Client-side routes fall back to index.html; missing assets do not.
      if (name.split('/').last.contains('.')) {
        response.statusCode = HttpStatus.notFound;
        await response.close();
        return;
      }
      try {
        name = 'index.html';
        bytes = await rootBundle.load('assets/web/index.html');
      } on FlutterError {
        response.statusCode = HttpStatus.serviceUnavailable;
        response.headers.contentType = ContentType.text;
        response.write('Bundled web files are missing. Build the web app first.');
        await response.close();
        return;
      }
    }

    response.headers.set(HttpHeaders.contentTypeHeader, _contentType(name));
    response.headers.set(HttpHeaders.cacheControlHeader, 'no-cache');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    if (request.method == 'HEAD') {
      await response.close();
      return;
    }
    final data = bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes);
    response.add(data);
    await response.close();
  }

  String _contentType(String path) {
    const types = <String, String>{
      'html': 'text/html; charset=utf-8',
      'js': 'application/javascript; charset=utf-8',
      'mjs': 'application/javascript; charset=utf-8',
      'css': 'text/css; charset=utf-8',
      'json': 'application/json; charset=utf-8',
      'webmanifest': 'application/manifest+json; charset=utf-8',
      'svg': 'image/svg+xml',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'webp': 'image/webp',
      'gif': 'image/gif',
      'ico': 'image/x-icon',
      'woff': 'font/woff',
      'woff2': 'font/woff2',
      'ttf': 'font/ttf',
      'otf': 'font/otf',
      'wasm': 'application/wasm',
      'mp3': 'audio/mpeg',
      'mp4': 'video/mp4',
      'txt': 'text/plain; charset=utf-8',
      'xml': 'application/xml; charset=utf-8',
    };
    final ext = path.contains('.') ? path.split('.').last.toLowerCase() : '';
    return types[ext] ?? 'application/octet-stream';
  }

  Future<void> _installHistoryBridge() async {
    const script = r'''(function () {
      if (window.__melodiyaBackBridgeInstalled) return;
      window.__melodiyaBackBridgeInstalled = true;
      function notifyNative() {
        try {
          var state = window.history.state;
          var canReturnToAppView = !!(state && state.__melodiyaAppNavigation === true && Number(state.depth || 0) > 0);
          if (window.MelodiyaBridge) {
            window.MelodiyaBridge.postMessage(String(canReturnToAppView));
          }
        } catch (_) {}
      }
      ['pushState', 'replaceState'].forEach(function (name) {
        var original = window.history[name];
        window.history[name] = function () {
          var result = original.apply(this, arguments);
          notifyNative();
          return result;
        };
      });
      window.addEventListener('popstate', notifyNative);
      notifyNative();
    })();''';
    try {
      await _web.runJavaScript(script);
    } catch (_) {
      // WebView may navigate while this bridge is being installed.
    }
  }

  Future<void> _openExternal(Uri uri) async {
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      // Ignore links Android has no app available to handle.
    }
  }

  Future<bool> _onBack() async {
    var canGoBack = _canGoBack;
    try {
      final browserState = await _web.runJavaScriptReturningResult(
        'Boolean(window.history.state && window.history.state.__melodiyaAppNavigation === true && Number(window.history.state.depth || 0) > 0)',
      );
      canGoBack = canGoBack || browserState.toString() == 'true';
    } catch (_) {}

    if (canGoBack) {
      await _web.goBack();
      return false;
    }

    if (!mounted) return false;
    final shouldExit = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Exit Sonora?'),
        content: const Text('Do you want to close the app?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Stay'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Exit'),
          ),
        ],
      ),
    );
    return shouldExit ?? false;
  }

  Future<void> _retry() async {
    setState(() {
      _error = null;
      _loading = true;
    });
    if (_server == null) {
      await _start();
    } else {
      await _web.loadRequest(Uri.parse('$_origin/'));
    }
  }

  Future<void> _requestNotificationPermission() async {
    if (!Platform.isAndroid || _notificationPermissionRequested) return;
    _notificationPermissionRequested = true;
    try {
      final status = await Permission.notification.request();
      if (!status.isGranted) {
        debugPrint('Sonora notification permission was not granted.');
      }
    } catch (error) {
      debugPrint('Could not request notification permission: $error');
    }
  }

  Future<void> _handleNativeMediaMessage(String rawMessage) async {
    try {
      final decoded = jsonDecode(rawMessage);
      if (decoded is! Map) return;
      final message = Map<String, dynamic>.from(decoded);
      final command = message['command'] as String?;
      if (command == 'clear') {
        _audioHandler.clear();
        return;
      }
      if (command != 'update' || !_appForeground) return;

      final videoId = (message['videoId'] as String?)?.trim() ?? '';
      if (videoId.isEmpty) {
        _audioHandler.clear();
        return;
      }
      final playing = message['playing'] == true;
      if (playing) await _requestNotificationPermission();
      _audioHandler.updateTrack(
        videoId: videoId,
        title: (message['title'] as String?)?.trim() ?? '',
        artist: (message['artist'] as String?)?.trim() ?? '',
        artworkUrl: (message['artwork'] as String?)?.trim() ?? '',
        playing: playing,
      );
    } catch (error) {
      debugPrint('Could not update the Android media notification: $error');
    }
  }

  Future<void> _dispatchNativeMediaAction(String action) async {
    if (!mounted || !_appForeground) return;
    final detail = jsonEncode({'action': action});
    final script = 'window.dispatchEvent(new CustomEvent("music-action", {detail: $detail}));';
    unawaited(_web.runJavaScript(script).catchError((_) {}));
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _appForeground = true;
      _audioHandler.setAppForeground(true);
    } else if (state == AppLifecycleState.paused || state == AppLifecycleState.detached) {
      _appForeground = false;
      _audioHandler.setAppForeground(false);
      unawaited(_web.runJavaScript(
        'window.dispatchEvent(new Event("melodiya-app-background"));',
      ).catchError((_) {}));
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _audioHandler.onMediaAction = null;
    final server = _server;
    if (server != null) unawaited(server.close(force: true));
    _nativeStateTimer?.cancel();
    if (_nativePlayerStateSubscription != null) unawaited(_nativePlayerStateSubscription!.cancel());
    if (_nativeErrorSubscription != null) unawaited(_nativeErrorSubscription!.cancel());
    unawaited(_nativeAudioPlayer.dispose());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: _onBack,
      child: Scaffold(
        body: SafeArea(
          top: true,
          bottom: true,
          child: Stack(
            children: [
              WebViewWidget(controller: _web),
              if (_loading && _error == null)
                Positioned.fill(
                  child: IgnorePointer(
                    child: ColoredBox(
                      color: const Color(0xFF080909),
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Image.asset(
                              'assets/web/icon-512x512.png',
                              width: 92,
                              height: 92,
                              fit: BoxFit.contain,
                              errorBuilder: (_, __, ___) => const Icon(
                                Icons.music_note_rounded,
                                color: Color(0xFFD4D4D8),
                                size: 72,
                              ),
                            ),
                            const SizedBox(height: 16),
                            const Text(
                              'Sonora',
                              style: TextStyle(fontSize: 25, fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 16),
                            SizedBox(
                              width: 132,
                              child: LinearProgressIndicator(
                                minHeight: 2,
                                value: _progress >= 100 ? null : _progress / 100,
                                backgroundColor: Colors.white12,
                                color: const Color(0xFFD4D4D8),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              if (_error != null)
                Positioned.fill(
                  child: ColoredBox(
                    color: const Color(0xFF080909),
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(28),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Image.asset(
                              'assets/web/icon-512x512.png',
                              width: 68,
                              height: 68,
                              errorBuilder: (_, __, ___) => const Icon(
                                Icons.music_note_rounded,
                                color: Color(0xFFD4D4D8),
                                size: 64,
                              ),
                            ),
                            const SizedBox(height: 16),
                            const Text(_appName,
                                style: TextStyle(
                                    fontSize: 24, fontWeight: FontWeight.bold)),
                            const SizedBox(height: 10),
                            const Text(
                              'Sonora could not start. Check the bundled assets and internet connection, then retry.',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.white70, height: 1.5),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              _error!,
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                  color: Colors.white38, fontSize: 11),
                            ),
                            const SizedBox(height: 22),
                            FilledButton.icon(
                              onPressed: _retry,
                              icon: const Icon(Icons.refresh_rounded),
                              label: const Text('Retry'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
