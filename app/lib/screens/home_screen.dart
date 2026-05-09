import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:hive/hive.dart';
import '../providers/ideas_list_provider.dart';
import '../widgets/idea_card.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ideasAsync = ref.watch(ideasListProvider);
    final roomBox = Hive.box('room');
    final roomName = roomBox.get('accessCode') as String? ?? 'Unknown Room';

    return Scaffold(
      appBar: AppBar(
        title: Text(roomName),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => context.push('/settings'),
          ),
        ],
      ),
      body: ideasAsync.when(
        data: (ideas) {
          if (ideas.isEmpty) {
            return const Center(
              child: Text('No ideas yet. Tap the mic to record one!'),
            );
          }
          return ListView.builder(
            itemCount: ideas.length,
            itemBuilder: (context, index) {
              final idea = ideas[index];
              return InkWell(
                onTap: () => context.push('/idea/${idea.id}'),
                child: IdeaCard(idea: idea),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, stack) => Center(child: Text('Error: $err')),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.push('/record'),
        child: const Icon(Icons.mic),
      ),
    );
  }
}
