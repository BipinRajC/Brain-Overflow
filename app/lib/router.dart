import 'package:go_router/go_router.dart';
import 'package:hive/hive.dart';
import 'screens/splash_screen.dart';
import 'screens/supabase_setup_screen.dart';
import 'screens/room_onboarding_screen.dart';
import 'screens/home_screen.dart';
import 'screens/idea_detail_screen.dart';
import 'screens/recording_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/prompt_editor_screen.dart';
import 'screens/model_manager_screen.dart';

final router = GoRouter(
  initialLocation: '/splash',
  redirect: (context, state) {
    final hasCreds = Hive.box('credentials').get('supabaseUrl') != null;
    final hasRoom = Hive.box('room').get('roomId') != null;
    if (!hasCreds) return '/setup';
    if (!hasRoom) return '/onboarding';
    return null;
  },
  routes: [
    GoRoute(path: '/splash', builder: (_, __) => const SplashScreen()),
    GoRoute(path: '/setup', builder: (_, __) => const SupabaseSetupScreen()),
    GoRoute(
        path: '/onboarding', builder: (_, __) => const RoomOnboardingScreen()),
    GoRoute(path: '/home', builder: (_, __) => const HomeScreen()),
    GoRoute(
      path: '/idea/:ideaId',
      builder: (_, state) => IdeaDetailScreen(
        ideaId: state.pathParameters['ideaId']!,
      ),
    ),
    GoRoute(path: '/record', builder: (_, __) => const RecordingScreen()),
    GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
    GoRoute(
        path: '/settings/prompts',
        builder: (_, __) => const PromptEditorScreen()),
    GoRoute(
        path: '/settings/models',
        builder: (_, __) => const ModelManagerScreen()),
  ],
);
