import 'package:device_info_plus/device_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Where Connect keeps this device's identity. An interface so tests don't need the platform plugins.
abstract class ConnectPrefs {
  Future<String?> deviceId();
  Future<void> saveDeviceId(String id);
  Future<String?> deviceName();
  Future<void> saveDeviceName(String name);

  /// "POCO 25053PC47G" — what the platform calls this phone, used for the default name; null if unknown.
  Future<String?> deviceModel();
}

class SharedPrefsConnectPrefs implements ConnectPrefs {
  static const _idKey = 'riffplayer_device_id';
  static const _nameKey = 'riffplayer_device_name';

  @override
  Future<String?> deviceId() async =>
      (await SharedPreferences.getInstance()).getString(_idKey);

  @override
  Future<void> saveDeviceId(String id) async =>
      (await SharedPreferences.getInstance()).setString(_idKey, id);

  @override
  Future<String?> deviceName() async =>
      (await SharedPreferences.getInstance()).getString(_nameKey);

  @override
  Future<void> saveDeviceName(String name) async =>
      (await SharedPreferences.getInstance()).setString(_nameKey, name);

  @override
  Future<String?> deviceModel() async {
    try {
      final info = await DeviceInfoPlugin().androidInfo;
      final brand = info.brand.isEmpty
          ? ''
          : '${info.brand[0].toUpperCase()}${info.brand.substring(1)} ';
      return '$brand${info.model}'.trim();
    } catch (_) {
      return null;
    }
  }
}
