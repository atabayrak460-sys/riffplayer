import 'package:flutter/material.dart';

/// Shows a brief failure SnackBar for a fire-and-forget network mutation
/// (star/unstar, download, etc.) that failed — guards against a
/// BuildContext that's no longer mounted by the time the async call
/// actually resolves or rejects.
void showFailureSnackBar(BuildContext context, String message) {
  if (!context.mounted) return;
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
}
