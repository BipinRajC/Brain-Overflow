import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hive/hive.dart';
import '../providers/models_provider.dart';
import '../services/model_service.dart';
import '../services/room_service.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final roomBox = Hive.box('room');
    final roomId = roomBox.get('roomId') as String?;
    final accessCode = roomBox.get('accessCode') as String? ?? 'N/A';
    final authorName = roomBox.get('authorName') as String? ?? 'N/A';

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Settings'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Room'),
              Tab(text: 'AI Model'),
              Tab(text: 'Prompts'),
              Tab(text: 'Server'),
            ],
          ),
        ),
        body: TabBarView(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ListTile(
                    title: const Text('Access Code'),
                    subtitle: Text(accessCode),
                    trailing: IconButton(
                      icon: const Icon(Icons.copy),
                      onPressed: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Copied to clipboard')),
                        );
                      },
                    ),
                  ),
                  ListTile(
                    title: const Text('Your Name'),
                    subtitle: Text(authorName),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: () async {
                      await Hive.box('room').clear();
                      await Hive.box('credentials').clear();
                      if (context.mounted) context.go('/splash');
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red,
                      foregroundColor: Colors.white,
                    ),
                    child: const Text('Leave Room & Reset'),
                  ),
                ],
              ),
            ),
            Consumer(builder: (context, ref, child) {
              final modelsAsync = ref.watch(modelsProvider);
              return modelsAsync.when(
                data: (models) {
                  final activeModels = models.where((m) => m.isActive).toList();
                  return ListView.builder(
                    itemCount: activeModels.length,
                    itemBuilder: (context, index) {
                      final model = activeModels[index];
                      return ListTile(
                        title: Text(model.displayName),
                        subtitle:
                            Text('${model.provider} • ${model.apiModelId}'),
                        onTap: () async {
                          if (roomId != null) {
                            final service =
                                ModelService(Supabase.instance.client);
                            await service.setRoomModel(roomId, model.id);
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                    content:
                                        Text('Selected ${model.displayName}')),
                              );
                            }
                          }
                        },
                      );
                    },
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (err, stack) => Center(child: Text('Error: $err')),
              );
            }),
            Center(
              child: ElevatedButton(
                onPressed: () => context.push('/settings/prompts'),
                child: const Text('Edit Prompts'),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                      'Change Supabase credentials and restart the app.'),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () async {
                      await Hive.box('credentials').clear();
                      await Hive.box('room').clear();
                      if (context.mounted) context.go('/setup');
                    },
                    child: const Text('Reset Credentials'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
