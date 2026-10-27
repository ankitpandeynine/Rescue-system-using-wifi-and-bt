import 'package:flutter_test/flutter_test.dart';
import 'package:remote_controller/main.dart';

void main() {
  testWidgets('ResqRemoteApp smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const ResqRemoteApp());
    expect(find.text('ResQ-Atlas Remote'), findsOneWidget);
  });
}
