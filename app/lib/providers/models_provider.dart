import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/model.dart';
import '../services/model_service.dart';

part 'models_provider.g.dart';

@riverpod
Future<List<AiModel>> models(ModelsRef ref) async {
  final modelService = ModelService(Supabase.instance.client);
  return modelService.fetchModels();
}
