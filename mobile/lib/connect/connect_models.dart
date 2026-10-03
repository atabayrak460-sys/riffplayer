// RiffPlayer Connect — wire models and pure helpers (see docs/CONNECT-DESIGN.md).
// No network, no Flutter: everything here is plain Dart so it is easy to test.

import 'dart:convert';
import 'dart:math';
import 'package:just_audio/just_audio.dart' show LoopMode;
import '../api/types.dart';

// ── Wire models ────────────────────────────────────────────────────────────────

enum DeviceType { web, android, desktop }

DeviceType parseDeviceType(String? v) => DeviceType.values.firstWhere(
      (t) => t.name == v,
      orElse: () => DeviceType.web,
    );

class DeviceInfo {
  final String id;
  final String name;
  final DeviceType type;

  /// Connected right now.
  final bool online;

  /// Offline for longer than the grace period — "Continue here" may be offered.
  final bool unreachable;
  final bool active;

  const DeviceInfo({
    required this.id,
    required this.name,
    required this.type,
    required this.online,
    required this.unreachable,
    required this.active,
  });

  factory DeviceInfo.fromJson(Map<String, dynamic> j) => DeviceInfo(
        id: j['id'] as String,
        name: j['name'] as String,
        type: parseDeviceType(j['type'] as String?),
        online: j['online'] as bool? ?? true,
        unreachable: j['unreachable'] as bool? ?? false,
        active: j['active'] as bool? ?? false,
      );
}

/// What the active device last reported.
class PublicState {
  final String activeDeviceId;
  final bool playing;
  final Song? song;
  final int index;
  final int queueLength;
  final int queueVersion;
  final int positionMs;

  /// Server clock at which [positionMs] was true.
  final int positionAtMs;
  final int? durationMs;
  final LoopMode repeat;
  final bool shuffle;
  final bool counted;

  const PublicState({
    required this.activeDeviceId,
    required this.playing,
    required this.song,
    required this.index,
    required this.queueLength,
    required this.queueVersion,
    required this.positionMs,
    required this.positionAtMs,
    required this.durationMs,
    required this.repeat,
    required this.shuffle,
    required this.counted,
  });

  factory PublicState.fromJson(Map<String, dynamic> j) => PublicState(
        activeDeviceId: j['activeDeviceId'] as String,
        playing: j['playing'] as bool? ?? false,
        song: j['song'] is Map<String, dynamic>
            ? Song.fromJson(j['song'] as Map<String, dynamic>)
            : null,
        index: (j['index'] as num?)?.toInt() ?? 0,
        queueLength: (j['queueLength'] as num?)?.toInt() ?? 0,
        queueVersion: (j['queueVersion'] as num?)?.toInt() ?? 0,
        positionMs: (j['positionMs'] as num?)?.toInt() ?? 0,
        positionAtMs: (j['positionAtMs'] as num?)?.toInt() ?? 0,
        durationMs: (j['durationMs'] as num?)?.toInt(),
        repeat: loopModeFromWire(j['repeat'] as String?),
        shuffle: j['shuffle'] as bool? ?? false,
        counted: j['counted'] as bool? ?? false,
      );

  PublicState copyWith({bool? playing, int? positionMs, int? positionAtMs}) =>
      PublicState(
        activeDeviceId: activeDeviceId,
        playing: playing ?? this.playing,
        song: song,
        index: index,
        queueLength: queueLength,
        queueVersion: queueVersion,
        positionMs: positionMs ?? this.positionMs,
        positionAtMs: positionAtMs ?? this.positionAtMs,
        durationMs: durationMs,
        repeat: repeat,
        shuffle: shuffle,
        counted: counted,
      );
}

class Snapshot {
  final List<DeviceInfo> devices;
  final String? activeDeviceId;
  final PublicState? state;

  const Snapshot(
      {required this.devices,
      required this.activeDeviceId,
      required this.state});

  factory Snapshot.fromJson(Map<String, dynamic> j) => Snapshot(
        devices: devicesFromJson(j['devices']),
        activeDeviceId: j['activeDeviceId'] as String?,
        state: j['state'] is Map<String, dynamic>
            ? PublicState.fromJson(j['state'] as Map<String, dynamic>)
            : null,
      );
}

List<DeviceInfo> devicesFromJson(Object? v) => (v as List<dynamic>? ?? [])
    .map((d) => DeviceInfo.fromJson(d as Map<String, dynamic>))
    .toList();

class LoadInstruction {
  final int queueVersion;
  final int index;
  final int positionMs;
  final bool play;
  final bool counted;

  const LoadInstruction({
    required this.queueVersion,
    required this.index,
    required this.positionMs,
    required this.play,
    required this.counted,
  });

  factory LoadInstruction.fromJson(Map<String, dynamic> j) => LoadInstruction(
        queueVersion: (j['queueVersion'] as num?)?.toInt() ?? 0,
        index: (j['index'] as num?)?.toInt() ?? 0,
        positionMs: (j['positionMs'] as num?)?.toInt() ?? 0,
        play: j['play'] as bool? ?? true,
        counted: j['counted'] as bool? ?? false,
      );
}

enum CommandType { play, pause, next, previous, seek }

class CommandInstruction {
  final String commandId;
  final CommandType type;
  final int? positionMs;
  final int expiresAtMs;

  const CommandInstruction({
    required this.commandId,
    required this.type,
    required this.positionMs,
    required this.expiresAtMs,
  });

  /// Null for a command type this client doesn't know (a newer server).
  static CommandInstruction? tryParse(Map<String, dynamic> j) {
    final type = CommandType.values.where((t) => t.name == j['type']);
    if (type.isEmpty) return null;
    return CommandInstruction(
      commandId: j['commandId'] as String,
      type: type.first,
      positionMs: (j['positionMs'] as num?)?.toInt(),
      expiresAtMs: (j['expiresAtMs'] as num?)?.toInt() ?? 0,
    );
  }
}

class QueueResult {
  final int queueVersion;
  final int index;
  final List<Song> songs;

  const QueueResult(
      {required this.queueVersion, required this.index, required this.songs});

  factory QueueResult.fromJson(Map<String, dynamic> j) => QueueResult(
        queueVersion: (j['queueVersion'] as num?)?.toInt() ?? 0,
        index: (j['index'] as num?)?.toInt() ?? 0,
        songs: (j['songs'] as List<dynamic>? ?? [])
            .map((s) => Song.fromJson(s as Map<String, dynamic>))
            .toList(),
      );
}

// ── Loop mode on the wire ─────────────────────────────────────────────────────

LoopMode loopModeFromWire(String? v) => switch (v) {
      'all' => LoopMode.all,
      'one' => LoopMode.one,
      _ => LoopMode.off,
    };

String loopModeToWire(LoopMode m) => switch (m) {
      LoopMode.all => 'all',
      LoopMode.one => 'one',
      LoopMode.off => 'off',
    };

// ── Server-sent events ────────────────────────────────────────────────────────

sealed class SseItem {
  const SseItem();
}

class SseEvent extends SseItem {
  final int? id;
  final String name;
  final Object? data;
  const SseEvent(this.name, this.data, [this.id]);

  @override
  bool operator ==(Object other) =>
      other is SseEvent &&
      other.name == name &&
      other.id == id &&
      jsonEncode(other.data) == jsonEncode(data);

  @override
  int get hashCode => Object.hash(name, id, jsonEncode(data));

  @override
  String toString() => 'SseEvent($name, $data, id: $id)';
}

/// A comment line such as ": ping" — the heartbeat that shows the connection is alive.
class SseComment extends SseItem {
  const SseComment();
}

/// Incremental parser for a `text/event-stream` body: feed it decoded text as it arrives, it returns the
/// complete items found so far and keeps the unfinished tail for the next chunk.
class SseParser {
  String _buffer = '';

  List<SseItem> push(String text) {
    _buffer += text.replaceAll('\r\n', '\n');
    final items = <SseItem>[];
    int end;
    while ((end = _buffer.indexOf('\n\n')) >= 0) {
      final block = _buffer.substring(0, end);
      _buffer = _buffer.substring(end + 2);
      final item = _parseBlock(block);
      if (item != null) items.add(item);
    }
    return items;
  }

  static SseItem? _parseBlock(String block) {
    if (block.trim().isEmpty) return null;
    String? name;
    int? id;
    final data = <String>[];
    var sawComment = false;
    for (final line in block.split('\n')) {
      if (line.startsWith(':')) {
        sawComment = true;
        continue;
      }
      final colon = line.indexOf(':');
      final field = colon < 0 ? line : line.substring(0, colon);
      var value = colon < 0 ? '' : line.substring(colon + 1);
      if (value.startsWith(' ')) value = value.substring(1);
      if (field == 'event') {
        name = value;
      } else if (field == 'data') {
        data.add(value);
      } else if (field == 'id' && RegExp(r'^\d+$').hasMatch(value)) {
        id = int.parse(value);
      }
      // "retry:" and unknown fields are ignored
    }
    if (name == null || data.isEmpty) {
      return sawComment ? const SseComment() : null;
    }
    try {
      return SseEvent(name, jsonDecode(data.join('\n')), id);
    } catch (_) {
      return null; // a malformed event is dropped rather than breaking the stream
    }
  }
}

// ── Time and retry helpers ────────────────────────────────────────────────────

/// Where the remote track is *now*, extrapolated from its report (server clock), clamped to its length.
int positionNowMs(PublicState s, int serverNowMs) {
  final int elapsed = max<int>(0, serverNowMs - s.positionAtMs);
  final int raw = s.playing ? s.positionMs + elapsed : s.positionMs;
  final int? duration = s.durationMs;
  return duration != null ? min<int>(raw, duration) : raw;
}

/// Reconnect delay: 1 s doubling up to 30 s, ±20% jitter so many clients don't retry in lockstep.
Duration backoff(int attempt, [double Function()? random]) {
  final r = (random ?? Random().nextDouble)();
  final base = min(30000, 1000 * pow(2, max(0, attempt)).toInt());
  return Duration(milliseconds: (base * (0.8 + r * 0.4)).round());
}

/// "Pixel 8" (or just "Android phone" when the model is unknown) — a readable default the user can rename.
String defaultDeviceName(String? model) {
  final m = model?.trim() ?? '';
  return m.isEmpty ? 'Android phone' : m;
}

/// A random id that fits the server's device-id format (8–64 chars of letters, digits, "-" and "_").
String newDeviceId([Random? random]) {
  final rng = random ?? Random.secure();
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return 'android-${List.generate(20, (_) => chars[rng.nextInt(chars.length)]).join()}';
}
