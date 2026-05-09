import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:hive/hive.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/prompt.dart';
import '../services/prompt_service.dart';
import '../services/room_service.dart';

part 'prompts_provider.g.dart';

@riverpod
Future<List<Prompt>> prompts(PromptsRef ref) async {
  final client = Supabase.instance.client;
  final roomService = RoomService(client, Hive.box('room'));
  final promptService = PromptService(client, roomService);
  return promptService.fetchPrompts();
}
