import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../api/types.dart';
import '../providers/providers.dart';
import '../utils/snackbar.dart';
import '../widgets/device_picker.dart';

const _transcodeFormats = [
  (null, 'Original format'),
  ('mp3', 'MP3'),
  ('aac', 'AAC'),
  ('opus', 'Opus'),
  ('ogg', 'OGG Vorbis'),
];

const _bitrates = [
  (null, 'No limit'),
  (64, '64 kbps'),
  (128, '128 kbps'),
  (192, '192 kbps'),
  (256, '256 kbps'),
  (320, '320 kbps'),
];

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final creds = auth.valueOrNull;
    final meAsync = ref.watch(meProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (creds != null) ...[
            const _SectionLabel('Account'),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFF18181B),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    backgroundColor: Theme.of(context).colorScheme.primary,
                    child: Text(
                      creds.username.isNotEmpty
                          ? creds.username[0].toUpperCase()
                          : '?',
                      style: const TextStyle(color: Colors.white),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          creds.username,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          creds.serverUrl,
                          style:
                              const TextStyle(color: Color(0xFF71717A), fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            const _PasswordSection(),
            const SizedBox(height: 24),
            const DeviceNameSection(),
            const SizedBox(height: 24),
          ],
          meAsync.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (_, __) => const SizedBox.shrink(),
            data: (me) => Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _PreferencesSection(me: me),
                if (me.isAdmin) ...[
                  const SizedBox(height: 24),
                  const _SectionLabel('Admin'),
                  const SizedBox(height: 8),
                  Container(
                    decoration: BoxDecoration(
                      color: const Color(0xFF18181B),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: ListTile(
                      leading: const Icon(Icons.admin_panel_settings,
                          color: Color(0xFF71717A)),
                      title: const Text('Admin panel',
                          style: TextStyle(color: Colors.white)),
                      subtitle: const Text('Users, libraries, server settings',
                          style: TextStyle(color: Color(0xFF71717A), fontSize: 12)),
                      trailing: const Icon(Icons.chevron_right, color: Color(0xFF71717A)),
                      onTap: () => context.push('/admin'),
                    ),
                  ),
                ],
                const SizedBox(height: 24),
              ],
            ),
          ),
          OutlinedButton.icon(
            onPressed: () => ref.read(authProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.red,
              side: const BorderSide(color: Colors.red),
              minimumSize: const Size.fromHeight(48),
            ),
          ),
        ],
      ),
    );
  }
}

class _PasswordSection extends ConsumerStatefulWidget {
  const _PasswordSection();

  @override
  ConsumerState<_PasswordSection> createState() => _PasswordSectionState();
}

class _PasswordSectionState extends ConsumerState<_PasswordSection> {
  final _currentCtrl = TextEditingController();
  final _newCtrl = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_currentCtrl.text.isEmpty || _newCtrl.text.isEmpty) {
      setState(() => _error = 'Fill in all fields.');
      return;
    }
    if (_newCtrl.text != _confirmCtrl.text) {
      setState(() => _error = "New passwords don't match.");
      return;
    }
    final client = ref.read(apiClientProvider);
    if (client == null) return;
    setState(() { _saving = true; _error = null; });
    try {
      await client.changeMyPassword(_currentCtrl.text, _newCtrl.text);
      if (!mounted) return;
      showSnackBar(context, 'Password changed — please sign in again.');
      // Changing your own password bumps token_version server-side,
      // invalidating this session's JWT and Subsonic credentials (now the
      // old password) immediately — same reasoning as the "Sign out" button
      // below, which also just clears credentials and lets the router
      // redirect to the login screen on its own.
      await ref.read(authProvider.notifier).logout();
    } on DioException catch (e) {
      final message = (e.response?.data is Map)
          ? (e.response?.data as Map)['error'] as String?
          : null;
      if (mounted) setState(() => _error = message ?? 'Failed to change password.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel('Password'),
        const SizedBox(height: 8),
        TextField(
          controller: _currentCtrl,
          obscureText: true,
          autofillHints: const [AutofillHints.password],
          decoration: const InputDecoration(hintText: 'Current password'),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _newCtrl,
          obscureText: true,
          autofillHints: const [AutofillHints.newPassword],
          decoration: const InputDecoration(hintText: 'New password'),
        ),
        const SizedBox(height: 8),
        TextField(
          controller: _confirmCtrl,
          obscureText: true,
          autofillHints: const [AutofillHints.newPassword],
          decoration: const InputDecoration(hintText: 'Confirm new password'),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: _saving ? null : _submit,
          child: Text(_saving ? 'Changing…' : 'Change password'),
        ),
        if (_error != null) ...[
          const SizedBox(height: 8),
          Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 12)),
        ],
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);
  @override
  Widget build(BuildContext context) => Text(
        text.toUpperCase(),
        style: const TextStyle(
          color: Color(0xFF71717A),
          fontSize: 12,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.2,
        ),
      );
}

class _PreferencesSection extends ConsumerStatefulWidget {
  final MeInfo me;
  const _PreferencesSection({required this.me});

  @override
  ConsumerState<_PreferencesSection> createState() => _PreferencesSectionState();
}

class _PreferencesSectionState extends ConsumerState<_PreferencesSection> {
  String? _format;
  int? _bitrate;
  late final TextEditingController _lbCtrl;
  late final TextEditingController _lfmCtrl;
  bool _saving = false;
  String? _savedMsg;

  @override
  void initState() {
    super.initState();
    final prefs = widget.me.preferences;
    _format = prefs?.transcodeFormat;
    _bitrate = prefs?.transcodeBitrate;
    _lbCtrl = TextEditingController(text: prefs?.listenbrainzToken ?? '');
    _lfmCtrl = TextEditingController(text: prefs?.lastfmSessionKey ?? '');
  }

  @override
  void dispose() {
    _lbCtrl.dispose();
    _lfmCtrl.dispose();
    super.dispose();
  }

  Future<void> _save(Map<String, dynamic> patch) async {
    final client = ref.read(apiClientProvider);
    if (client == null) return;
    setState(() { _saving = true; _savedMsg = null; });
    try {
      await client.updateMyPreferences(patch);
      if (mounted) setState(() => _savedMsg = 'Saved.');
    } catch (e) {
      if (mounted) setState(() => _savedMsg = 'Save failed.');
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionLabel('Transcoding'),
        const SizedBox(height: 4),
        const Text(
          'Preferred format/bitrate for mobile data saving. Leave as original to stream unmodified.',
          style: TextStyle(color: Color(0xFF71717A), fontSize: 12),
        ),
        const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: DropdownButtonFormField<String?>(
                initialValue: _format,
                dropdownColor: const Color(0xFF27272A),
                decoration: const InputDecoration(isDense: true),
                items: _transcodeFormats
                    .map((f) => DropdownMenuItem(value: f.$1, child: Text(f.$2)))
                    .toList(),
                onChanged: (v) => setState(() => _format = v),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: DropdownButtonFormField<int?>(
                initialValue: _bitrate,
                dropdownColor: const Color(0xFF27272A),
                decoration: const InputDecoration(isDense: true),
                items: _bitrates
                    .map((b) => DropdownMenuItem(value: b.$1, child: Text(b.$2)))
                    .toList(),
                onChanged: (v) => setState(() => _bitrate = v),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: _saving
              ? null
              : () => _save({'transcode_format': _format, 'transcode_bitrate': _bitrate}),
          child: const Text('Save transcoding'),
        ),
        const SizedBox(height: 24),
        const _SectionLabel('ListenBrainz'),
        const SizedBox(height: 8),
        TextField(
          controller: _lbCtrl,
          decoration: const InputDecoration(hintText: 'ListenBrainz user token'),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: _saving
              ? null
              : () => _save({'listenbrainz_token': _lbCtrl.text.trim().isEmpty ? null : _lbCtrl.text.trim()}),
          child: const Text('Save ListenBrainz'),
        ),
        const SizedBox(height: 24),
        const _SectionLabel('Last.fm'),
        const SizedBox(height: 8),
        TextField(
          controller: _lfmCtrl,
          decoration: const InputDecoration(hintText: 'Last.fm session key'),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: _saving
              ? null
              : () => _save({'lastfm_session_key': _lfmCtrl.text.trim().isEmpty ? null : _lfmCtrl.text.trim()}),
          child: const Text('Save Last.fm'),
        ),
        if (_savedMsg != null) ...[
          const SizedBox(height: 8),
          Text(_savedMsg!,
              style: TextStyle(
                  color: _savedMsg == 'Saved.' ? Colors.green : Colors.red, fontSize: 12)),
        ],
      ],
    );
  }
}
