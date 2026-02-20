import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { WebView } from 'react-native-webview';

type Props = {
  html: string;
  visible?: boolean;
  onClose?: () => void;
  asModal?: boolean;
};

const wrapHtml = (body: string) => `
  <html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, sans-serif; padding: 16px; font-size: 15px; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #ddd; padding: 8px; vertical-align: top; }
    th { background: #f5f5f5; font-weight: bold; }
    h1,h2,h3 { color: #172B4D; }
  </style>
  </head><body>${body}</body></html>
`;

export function HtmlPreview({ html, visible, onClose, asModal }: Props) {
  const content = (
    <View style={styles.container}>
      {asModal && (
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeText}>닫기</Text>
        </TouchableOpacity>
      )}
      {html ? (
        <WebView source={{ html: wrapHtml(html) }} style={styles.webview} />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>여기에 미리보기가 표시됩니다</Text>
        </View>
      )}
    </View>
  );

  if (asModal) {
    return (
      <Modal visible={visible ?? false} animationType="slide" onRequestClose={onClose}>
        {content}
      </Modal>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  webview: { flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#aaa', fontSize: 14 },
  closeBtn: { padding: 16, alignItems: 'flex-end', borderBottomWidth: 1, borderColor: '#eee' },
  closeText: { color: '#0052CC', fontSize: 16, fontWeight: '600' },
});
