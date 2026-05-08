import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:hive/hive.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class RoomOnboardingScreen extends StatefulWidget {
  const RoomOnboardingScreen({super.key});

  @override
  State<RoomOnboardingScreen> createState() => _RoomOnboardingScreenState();
}

class _RoomOnboardingScreenState extends State<RoomOnboardingScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _createNameController = TextEditingController();
  final _createAuthorController = TextEditingController();
  final _joinCodeController = TextEditingController();
  final _joinAuthorController = TextEditingController();
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _createNameController.dispose();
    _createAuthorController.dispose();
    _joinCodeController.dispose();
    _joinAuthorController.dispose();
    super.dispose();
  }

  Future<void> _createRoom() async {
    setState(() => _loading = true);
    try {
      final res = await Supabase.instance.client.functions.invoke(
        'create_room',
        body: {
          'name': _createNameController.text.trim(),
          'author_name': _createAuthorController.text.trim(),
        },
      );
      final data = res.data as Map<String, dynamic>;
      await _persistRoom(data, _createAuthorController.text.trim());
      if (mounted) context.go('/home');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _joinRoom() async {
    setState(() => _loading = true);
    try {
      final data = await Supabase.instance.client
          .from('rooms')
          .select()
          .eq('access_code', _joinCodeController.text.trim().toUpperCase())
          .eq('is_active', true)
          .single();
      await _persistRoom(data, _joinAuthorController.text.trim());
      if (mounted) context.go('/home');
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Room not found or inactive')),
        );
      }
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _persistRoom(
      Map<String, dynamic> data, String authorName) async {
    final box = Hive.box('room');
    await box.put('roomId', data['id']);
    await box.put('accessCode', data['access_code']);
    await box.put('authorName', authorName);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Join or Create Room'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Create Room'),
            Tab(text: 'Join Room'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: _createNameController,
                  decoration: const InputDecoration(labelText: 'Room Name'),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _createAuthorController,
                  decoration: const InputDecoration(labelText: 'Your Name'),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _loading ? null : _createRoom,
                  child: _loading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Create Room'),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: _joinCodeController,
                  decoration: const InputDecoration(
                    labelText: 'Access Code (6 chars)',
                  ),
                  textCapitalization: TextCapitalization.characters,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _joinAuthorController,
                  decoration: const InputDecoration(labelText: 'Your Name'),
                ),
                const SizedBox(height: 24),
                ElevatedButton(
                  onPressed: _loading ? null : _joinRoom,
                  child: _loading
                      ? const SizedBox(
                          height: 20,
                          width: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Join Room'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
