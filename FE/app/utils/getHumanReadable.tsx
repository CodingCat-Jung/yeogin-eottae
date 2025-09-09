// src/utils/getHumanReadable.ts

import {
  Activity,
  Armchair,
  Blend,
  CakeSlice,
  Car,
  ChevronsLeftRightEllipsis,
  CircleEllipsis,
  Coffee,
  FishSymbol,
  FlameKindling,
  Footprints,
  Handshake,
  Heart,
  Leaf,
  MessageCircleHeart,
  Milestone,
  Palette,
  Pizza,
  Pyramid,
  Snowflake,
  TramFront,
  User,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { ReactNode } from "react";

type IconValuePair = {
  icon: ReactNode;
  value: string;
};

export function getHumanReadable(
  type: string,
  value: string | string[]
): IconValuePair | IconValuePair[] | string {
  switch (type) {
    case "companion":
      switch (value) {
        case "single":
          return { icon: <User />, value: "혼자 여행" };
        case "friend":
          return { icon: <Handshake />, value: "친구와 함께" };
        case "sweetheart":
          return { icon: <Heart />, value: "연인과 함께" };
        case "family":
          return { icon: <Blend />, value: "가족과 함께" };
        default:
          return { icon: <CircleEllipsis />, value: String(value) };
      }

    case "style":
      if (Array.isArray(value)) return getStyles(value);
      return getStyles(value.split(","));

    case "driving":
      return value === "public_transport"
        ? { icon: <TramFront />, value: "대중교통 이용" }
        : { icon: <Car />, value: "자가용 운전" };

    case "climate":
      switch (value) {
        case "snowy":
          return { icon: <Snowflake />, value: "추운 지역" };
        case "fresh":
          return { icon: <Leaf />, value: "선선한 지역" };
        default:
          return { icon: <FlameKindling />, value: "따뜻한 지역" };
      }

    case "continent":
      switch (value) {
        case "asia":
          return { icon: <Coffee />, value: "아시아" };
        case "europe":
          return { icon: <CakeSlice />, value: "유럽" };
        case "america":
          return { icon: <Pizza />, value: "미주" };
        case "africa":
          return { icon: <Pyramid />, value: "아프리카" };
        case "oceania":
          return { icon: <FishSymbol />, value: "오세아니아" };
        default:
          return { icon: <CircleEllipsis />, value: "기타" };
      }

    case "density":
      switch (value) {
        case "active":
          return { icon: <Activity />, value: "활기찬 장소" };
        case "moderate":
          return { icon: <Footprints />, value: "적당한 밀집도" };
        default:
          return { icon: <Armchair />, value: "조용한 장소" };
      }

    default:
      return String(value);
  }
}

function getStyles(values: string[]): IconValuePair[] {
  const styles: IconValuePair[] = [];

  values.forEach((item) => {
    switch (item) {
      case "heartful":
        styles.push({ icon: <MessageCircleHeart />, value: "감성 여행" });
        break;
      case "activity":
        styles.push({ icon: <Milestone />, value: "액티비티 여행" });
        break;
      case "food":
        styles.push({ icon: <UtensilsCrossed />, value: "미식 여행" });
        break;
      case "culture":
        styles.push({ icon: <Palette />, value: "문화 체험" });
        break;
      default:
        styles.push({ icon: <CircleEllipsis />, value: item });
    }
  });

  return styles;
}
