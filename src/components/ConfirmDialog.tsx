import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';

export type DialogButton = {
  text: string;
  onPress?: () => void;
  cancel?: boolean;
};

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  buttons: DialogButton[];
  vertical?: boolean;
};

export function ConfirmDialog({ visible, title, message, buttons, vertical }: Props) {
  return (
    <Modal transparent animationType="fade" visible={visible} statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.divider} />
          <View style={[styles.buttons, vertical && styles.buttonsVertical]}>
            {buttons.map((btn, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  styles.btn,
                  vertical ? styles.btnVerticalBorder : (i < buttons.length - 1 && styles.btnBorder),
                ]}
                onPress={btn.onPress}
              >
                <Text style={[styles.btnText, btn.cancel && styles.btnCancelText]}>
                  {btn.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    backgroundColor: '#fff',
    borderRadius: 14,
    width: 280,
    overflow: 'hidden',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
    paddingTop: 20,
    paddingHorizontal: 16,
  },
  message: {
    fontSize: 13,
    color: '#444',
    textAlign: 'center',
    paddingTop: 6,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#ccc',
  },
  buttons: {
    flexDirection: 'row',
  },
  buttonsVertical: {
    flexDirection: 'column',
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnBorder: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#ccc',
  },
  btnVerticalBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
  },
  btnText: {
    fontSize: 17,
    color: '#0052CC',
    fontWeight: '500',
  },
  btnCancelText: {
    color: '#888',
    fontWeight: '400',
  },
});
