import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/chat_message.dart';
import '../services/chat_service.dart';

part 'chat_messages_provider.g.dart';

@riverpod
Stream<List<ChatMessage>> chatMessages(ChatMessagesRef ref, String ideaId) {
  final chatService = ChatService(Supabase.instance.client);
  return chatService.watchMessages(ideaId);
}
