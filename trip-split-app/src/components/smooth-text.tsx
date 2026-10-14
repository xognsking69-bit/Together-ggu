import React from "react";
import { Text, TextInput, StyleSheet, type TextProps, type TextInputProps } from "react-native";
import {useAppAppearance} from './appearance-context';
import {useAppLanguage,translateUI} from './language-context';
import {readableTextColor} from './text-contrast';
export function SmoothText(props:TextProps & {localize?:boolean}) {
  const {style,children,localize=false,...rest}=props;
  const {isDark,colors}=useAppAppearance();const {language}=useAppLanguage();
  const color=readableTextColor(StyleSheet.flatten(style)?.color,isDark,colors.text,colors.muted);
  return <Text {...rest} style={[{includeFontPadding:false},style,color&&{color}]}>{localize&&typeof children==='string'?translateUI(children,language):children}</Text>;
}
export function SmoothTextInput(props:TextInputProps) {
  const {style,placeholder,...rest}=props;const {isDark,colors}=useAppAppearance();const {language}=useAppLanguage();
  const flat=StyleSheet.flatten(style);const lightInput=typeof flat?.backgroundColor==='string'&&/^#(?:F|E)/i.test(flat.backgroundColor);
  return <TextInput {...rest} placeholder={placeholder?translateUI(placeholder,language):placeholder} style={[{includeFontPadding:false},style,isDark&&{color:lightInput?'#202230':colors.text}]} placeholderTextColor={isDark?colors.muted:props.placeholderTextColor}/>;
}
