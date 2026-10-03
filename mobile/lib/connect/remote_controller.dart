import 'connect_models.dart';

/// Hook that lets RiffPlayer Connect turn the player's transport actions into remote commands while
/// another device is the one playing (the Dart counterpart of `remote` in web/src/store/player.ts).
/// A tiny interface in its own file so the player doesn't depend on the connect notifier.
abstract class RemoteController {
  /// Another device is playing and this one is only a remote.
  bool get isRemote;

  void command(CommandType type, {int? positionMs});

  /// The user started something on this device (a takeover is on its way).
  void onLocalStart();
}
