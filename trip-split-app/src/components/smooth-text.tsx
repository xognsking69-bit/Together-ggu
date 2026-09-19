import React from "react";
import { Text, TextInput, type TextProps, type TextInputProps } from "react-native";
export function SmoothText(props: TextProps) { const {style,...rest}=props; return <Text {...rest} style={[{includeFontPadding:false},style]} />; }
export function SmoothTextInput(props: TextInputProps) { const {style,...rest}=props; return <TextInput {...rest} style={[{includeFontPadding:false},style]} />; }
