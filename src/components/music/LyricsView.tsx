import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Music2, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';

interface LyricsViewProps {
  trackTitle: string;
  trackArtist: string;
  isVisible: boolean;
  onClose: () => void;
}

export const LyricsView: React.FC<LyricsViewProps> = ({
  trackTitle,
  trackArtist,
  isVisible,
  onClose,
}) => {
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isVisible && trackTitle && trackArtist) {
      fetchLyrics();
    }
  }, [trackTitle, trackArtist, isVisible]);

  const fetchLyrics = async () => {
    setLoading(true);
    setError(null);
    setLyrics(null);

    try {
      // Clean up title - remove common suffixes like (Official Video), [Lyrics], karaoke terms, etc.
      const cleanTitle = trackTitle
        .replace(/\(.*?\)/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/official\s*(music\s*)?video/gi, '')
        .replace(/lyrics?\s*video/gi, '')
        .replace(/audio/gi, '')
        .replace(/hd|hq|4k/gi, '')
        .replace(/ft\.?|feat\.?/gi, '')
        .replace(/karao?ke/gi, '')
        .replace(/instrumental/gi, '')
        .replace(/backing\s*track/gi, '')
        .replace(/piano\s*version/gi, '')
        .replace(/cover/gi, '')
        .replace(/\|.*$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const cleanArtist = trackArtist
        .replace(/\s*-\s*Topic$/i, '')
        .replace(/VEVO$/i, '')
        .replace(/karao?ke/gi, '')
        .replace(/\|.*$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      // Try LRCLIB first for better results
      try {
        const lrcRes = await fetch(
          `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanArtist} ${cleanTitle}`)}`,
          { headers: { 'User-Agent': 'Melodiya Music App v1.0' } }
        );
        if (lrcRes.ok) {
          const results = await lrcRes.json();
          if (Array.isArray(results) && results.length > 0) {
            const best = results[0];
            if (best.plainLyrics) {
              setLyrics(best.plainLyrics.trim());
              setLoading(false);
              return;
            }
          }
        }
      } catch (e) { console.log('LRCLIB search failed:', e); }

      // Try lyrics.ovh API
      const response = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.lyrics) {
          setLyrics(data.lyrics.trim());
          setLoading(false);
          return;
        }
      }

      // If first attempt fails, try with just the first part of the title
      const shortTitle = cleanTitle.split(/[-|,]/)[0].trim();
      if (shortTitle !== cleanTitle && shortTitle.length > 2) {
        try {
          const lrcRes2 = await fetch(
            `https://lrclib.net/api/search?q=${encodeURIComponent(shortTitle)}`,
            { headers: { 'User-Agent': 'Melodiya Music App v1.0' } }
          );
          if (lrcRes2.ok) {
            const results2 = await lrcRes2.json();
            if (Array.isArray(results2) && results2.length > 0 && results2[0].plainLyrics) {
              setLyrics(results2[0].plainLyrics.trim());
              setLoading(false);
              return;
            }
          }
        } catch (e) { /* ignore */ }

        const response2 = await fetch(
          `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(shortTitle)}`
        );

        if (response2.ok) {
          const data2 = await response2.json();
          if (data2.lyrics) {
            setLyrics(data2.lyrics.trim());
            setLoading(false);
            return;
          }
        }
      }

      setError('Lyrics not found for this song');
    } catch (err) {
      console.error('Error fetching lyrics:', err);
      setError('Could not load lyrics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-xl flex flex-col animate-in slide-in-from-bottom duration-300">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/30">
        <div className="flex items-center gap-3">
          <Music2 className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-bold truncate max-w-[250px] md:max-w-none">{trackTitle}</h2>
            <p className="text-sm text-muted-foreground">{trackArtist}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-10 w-10 p-0 rounded-full"
          onClick={onClose}
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Lyrics Content */}
      <ScrollArea className="flex-1 px-6 py-8">
        <div className="max-w-lg mx-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Finding lyrics...</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Music2 className="w-16 h-16 text-muted-foreground/30" />
              <p className="text-muted-foreground text-center">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchLyrics}>
                Try Again
              </Button>
            </div>
          )}

          {lyrics && !loading && (
            <div className="space-y-1">
              {lyrics.split('\n').map((line, index) => (
                <p
                  key={index}
                  className={`text-lg leading-relaxed transition-colors ${
                    line.trim() === ''
                      ? 'h-6'
                      : 'text-foreground/90 hover:text-primary cursor-default'
                  }`}
                >
                  {line || '\u00A0'}
                </p>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
