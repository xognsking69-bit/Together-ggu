import React, { useRef } from "react";
import { Animated, Pressable, type PressableProps } from "react-native";
export default function SmoothPressable({children,style,onPressIn,onPressOut,...rest}:PressableProps){
 const scale=useRef(new Animated.Value(1)).current;
 const animate=(toValue:number)=>Animated.spring(scale,{toValue,useNativeDriver:true,speed:28,bounciness:4}).start();
 return <Animated.View style={{transform:[{scale}]}}><Pressable {...rest} onPressIn={e=>{animate(.985);onPressIn?.(e)}} onPressOut={e=>{animate(1);onPressOut?.(e)}} style={style}>{children}</Pressable></Animated.View>;
}
