import 'dart:async';

import 'package:cadence_mobile/api/types.dart';
import 'package:cadence_mobile/providers/providers.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:just_audio/just_audio.dart';
import 'package:mocktail/mocktail.dart';

import '../helpers/mocks.dart';

Song _song(String id, {String? starred}) => Song(
      id: id,
      title: 'Title $id',
      artist: 'Artist',
      artistId: 'artist-1',
      album: 'Album',
      albumId: 'album-1',
      suffix: 'mp3',
      starred: starred,
    );

void main() {
  setUpAll(registerMockFallbackValues);

  late MockAudioHandler handler;
  late MockSubsonicClient client;
  late MockDownloadService downloads;
  late PlayerNotifier notifier;

  setUp(() {
    handler = MockAudioHandler();
    client = MockSubsonicClient();
    downloads = MockDownloadService();

    // PlayerNotifier's constructor subscribes to every one of these
    // immediately, so even tests that don't care about a given stream still
    // need it stubbed — an unstubbed stream getter throws.
    when(() => handler.positionStream).thenAnswer((_) => const Stream.empty());
    when(() => handler.durationStream).thenAnswer((_) => const Stream.empty());
    when(() => handler.playingStream).thenAnswer((_) => const Stream.empty());
    when(() => handler.currentIndexStream)
        .thenAnswer((_) => const Stream.empty());
    when(() => handler.shuffleModeEnabledStream)
        .thenAnswer((_) => const Stream.empty());
    when(() => handler.loopModeStream).thenAnswer((_) => const Stream.empty());

    when(() => handler.insertAt(any(), any())).thenAnswer((_) async {});
    when(() => handler.removeQueueItemAt(any())).thenAnswer((_) async {});
    when(() => handler.moveQueueItem(any(), any())).thenAnswer((_) async {});
    when(() => handler.clearQueue()).thenAnswer((_) async {});
    when(() => handler.playFromIndex(any())).thenAnswer((_) async {});
    when(() => handler.playQueue(any(), any())).thenAnswer((_) async {});
    when(() => handler.setLoopMode(any())).thenAnswer((_) async {});
    when(() => handler.setShuffleModeEnabled(any())).thenAnswer((_) async {});
    when(() => handler.skipToNext()).thenAnswer((_) async {});
    when(() => handler.skipToPrevious()).thenAnswer((_) async {});

    // buildAudioSource() (called by playSong/addToQueue) always checks for a
    // local download first — no test here downloads anything, so it always
    // falls through to the streamed URL.
    when(() => downloads.localPath(any())).thenAnswer((_) async => null);
    when(() => client.streamUrl(any())).thenReturn('http://test/stream');
    when(() => client.scrobble(any(), submission: any(named: 'submission')))
        .thenAnswer((_) async {});

    notifier = PlayerNotifier(handler);
  });

  group('addToQueue', () {
    test('starts playback from scratch when nothing is queued', () async {
      final a = _song('a');

      await notifier.addToQueue(a, client, downloads);

      expect(notifier.state.queue, [a]);
      expect(notifier.state.currentIndex, 0);
      verify(() => handler.insertAt(0, any())).called(1);
    });

    test('inserts right after the current track', () async {
      final current = _song('current');
      final a = _song('a');
      await notifier.playSong(current, client, downloads);

      await notifier.addToQueue(a, client, downloads);

      expect(notifier.state.queue.map((s) => s.id), ['current', 'a']);
      verify(() => handler.insertAt(1, any())).called(1);
    });

    test('queueing A then B plays current -> A -> B, not current -> B -> A',
        () async {
      final current = _song('current');
      final a = _song('a');
      final b = _song('b');
      await notifier.playSong(current, client, downloads);

      await notifier.addToQueue(a, client, downloads);
      await notifier.addToQueue(b, client, downloads);

      expect(notifier.state.queue.map((s) => s.id), ['current', 'a', 'b']);
      verify(() => handler.insertAt(1, any())).called(1);
      verify(() => handler.insertAt(2, any())).called(1);
    });

    // Regression test for a real bug found on-device: flutter_slidable's
    // swipe-to-queue gesture could dispatch two addToQueue() calls for one
    // swipe (confirmDismiss + SlidableAction.onPressed both firing). Before
    // the fix, addToQueue read `state.currentIndex`/`_queuedCount` before
    // awaiting `_handler.insertAt()`, then combined that stale index with a
    // freshly-read `state.queue` afterward — two overlapping calls raced on
    // that gap, throwing a RangeError and silently dropping the add.
    test(
        'two calls fired back to back before either resolves do not race or throw',
        () async {
      final current = _song('current');
      final a = _song('a');
      final b = _song('b');
      await notifier.playSong(current, client, downloads);

      // Gate handler.insertAt so both addToQueue calls are genuinely
      // in-flight at once before either's post-await state write lands.
      final gate = Completer<void>();
      when(() => handler.insertAt(any(), any())).thenAnswer((_) => gate.future);

      final futureA = notifier.addToQueue(a, client, downloads);
      final futureB = notifier.addToQueue(b, client, downloads);
      gate.complete();

      await expectLater(Future.wait([futureA, futureB]), completes);
      expect(notifier.state.queue.map((s) => s.id), ['current', 'a', 'b']);
    });

    test(
        'racing a clearQueue() mid-flight does not throw (regression — used to '
        'crash with a RangeError when state.queue emptied out from under a '
        'stale pre-await insert index)', () async {
      final current = _song('current');
      final a = _song('a');
      await notifier.playSong(current, client, downloads);

      final gate = Completer<void>();
      when(() => handler.insertAt(any(), any())).thenAnswer((_) => gate.future);

      final addFuture = notifier.addToQueue(a, client, downloads);
      final clearFuture = notifier.clearQueue();
      gate.complete();

      await expectLater(Future.wait([addFuture, clearFuture]), completes);
      // Serialized in call order: the add lands first (queue becomes
      // [current, a]), then clearQueue empties it — never a crash either way.
      expect(notifier.state.queue, isEmpty);
      expect(notifier.state.currentIndex, -1);
    });
  });

  group('playSong', () {
    test('with no queue given, plays just that song at index 0', () async {
      final a = _song('a');

      await notifier.playSong(a, client, downloads);

      expect(notifier.state.queue, [a]);
      expect(notifier.state.currentIndex, 0);
      verify(() => handler.playQueue(any(), 0)).called(1);
    });

    test('an explicit queueIndex is trusted over searching the queue',
        () async {
      final a = _song('a');
      final b = _song('b');

      await notifier.playSong(b, client, downloads,
          queue: [a, b], queueIndex: 1);

      expect(notifier.state.currentIndex, 1);
      verify(() => handler.playQueue(any(), 1)).called(1);
    });

    test('without an explicit index, finds the song by id within the queue',
        () async {
      final a = _song('a');
      final b = _song('b');
      final c = _song('c');

      await notifier.playSong(b, client, downloads, queue: [a, b, c]);

      expect(notifier.state.currentIndex, 1);
      verify(() => handler.playQueue(any(), 1)).called(1);
    });

    test('falls back to index 0 when the song is not found in the queue',
        () async {
      final a = _song('a');
      final b = _song('b');
      final other = _song('not-in-queue');

      await notifier.playSong(other, client, downloads, queue: [a, b]);

      expect(notifier.state.currentIndex, 0);
      verify(() => handler.playQueue(any(), 0)).called(1);
    });
  });

  group('removeFromQueue', () {
    test('leaves currentIndex alone when removing a song after it', () async {
      final current = _song('current');
      final a = _song('a');
      await notifier.playSong(current, client, downloads,
          queue: [current, a], queueIndex: 0);

      await notifier.removeFromQueue(1);

      expect(notifier.state.queue.map((s) => s.id), ['current']);
      expect(notifier.state.currentIndex, 0);
    });

    test('shifts currentIndex down when removing a song before it', () async {
      final before = _song('before');
      final current = _song('current');
      await notifier.playSong(current, client, downloads,
          queue: [before, current], queueIndex: 1);

      await notifier.removeFromQueue(0);

      expect(notifier.state.queue.map((s) => s.id), ['current']);
      expect(notifier.state.currentIndex, 0);
    });
  });

  group('reorderQueue', () {
    test('moves a song from one index to another', () async {
      final a = _song('a');
      final b = _song('b');
      final c = _song('c');
      await notifier.playSong(a, client, downloads,
          queue: [a, b, c], queueIndex: 0);

      await notifier.reorderQueue(2, 0);

      expect(notifier.state.queue.map((s) => s.id), ['c', 'a', 'b']);
      verify(() => handler.moveQueueItem(2, 0)).called(1);
    });
  });

  group('clearQueue', () {
    test('empties the queue and resets playback state', () async {
      final a = _song('a');
      await notifier.playSong(a, client, downloads);

      await notifier.clearQueue();

      expect(notifier.state.queue, isEmpty);
      expect(notifier.state.currentIndex, -1);
      expect(notifier.state.playing, isFalse);
    });

    test('a fresh addToQueue after clearing starts a new block from scratch',
        () async {
      final a = _song('a');
      final b = _song('b');
      final c = _song('c');
      await notifier.playSong(a, client, downloads);
      await notifier.addToQueue(b, client, downloads);
      await notifier.clearQueue();

      await notifier.addToQueue(c, client, downloads);

      expect(notifier.state.queue, [c]);
      expect(notifier.state.currentIndex, 0);
    });
  });

  group('playFromQueueIndex', () {
    test('drops everything before the target index', () async {
      final a = _song('a');
      final b = _song('b');
      final c = _song('c');
      await notifier.playSong(a, client, downloads,
          queue: [a, b, c], queueIndex: 0);

      await notifier.playFromQueueIndex(2);

      expect(notifier.state.queue.map((s) => s.id), ['c']);
      expect(notifier.state.currentIndex, 0);
      verify(() => handler.playFromIndex(2)).called(1);
    });
  });

  group('setStarredInQueue', () {
    test('patches only the matching song, leaving others untouched', () async {
      final a = _song('a');
      final b = _song('b');
      await notifier.playSong(a, client, downloads,
          queue: [a, b], queueIndex: 0);

      notifier.setStarredInQueue('b', 'true');

      expect(notifier.state.queue[0].isStarred, isFalse);
      expect(notifier.state.queue[1].isStarred, isTrue);
    });
  });

  group('simple delegations', () {
    test('next() and previous() delegate straight to the handler', () {
      notifier.next();
      notifier.previous();

      verify(() => handler.skipToNext()).called(1);
      verify(() => handler.skipToPrevious()).called(1);
    });

    test('toggleShuffle() flips the current shuffle state', () {
      notifier.toggleShuffle();
      verify(() => handler.setShuffleModeEnabled(true)).called(1);
    });
  });

  group('toggleRepeat', () {
    test(
        'cycles off -> all -> one -> off as the handler reports each mode back',
        () async {
      final loopModeController = StreamController<LoopMode>();
      addTearDown(loopModeController.close);
      when(() => handler.loopModeStream)
          .thenAnswer((_) => loopModeController.stream);
      // Rebuild so the notifier subscribes to the controller-backed stream
      // instead of the empty one from setUp().
      notifier = PlayerNotifier(handler);

      notifier.toggleRepeat();
      verify(() => handler.setLoopMode(LoopMode.all)).called(1);
      loopModeController.add(LoopMode.all);
      await pumpEventQueue();

      notifier.toggleRepeat();
      verify(() => handler.setLoopMode(LoopMode.one)).called(1);
      loopModeController.add(LoopMode.one);
      await pumpEventQueue();

      notifier.toggleRepeat();
      verify(() => handler.setLoopMode(LoopMode.off)).called(1);
    });
  });
}
