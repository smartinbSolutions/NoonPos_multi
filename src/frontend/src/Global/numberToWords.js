// src/frontend/src/Global/numberToWords.js
//
// Converts a numeric amount into words, for the three supported languages.
// Used on printed payment vouchers ("Amount in words: Two thousand and four...").
// Handles whole currency units + minor units (cents/fils) separately, since
// that's how financial documents conventionally spell amounts.

const ONES_EN = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS_EN = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];
const SCALE_EN = ["", "Thousand", "Million", "Billion"];

function threeDigitsToWordsEn(n) {
  let str = "";
  if (n >= 100) {
    str += ONES_EN[Math.floor(n / 100)] + " Hundred";
    n %= 100;
    if (n > 0) str += " ";
  }
  if (n >= 20) {
    str += TENS_EN[Math.floor(n / 10)];
    if (n % 10 > 0) str += "-" + ONES_EN[n % 10];
  } else if (n > 0) {
    str += ONES_EN[n];
  }
  return str;
}

function numberToWordsEn(num) {
  if (num === 0) return "Zero";
  let groups = [];
  let n = Math.floor(num);
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  let parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] > 0) {
      const words = threeDigitsToWordsEn(groups[i]);
      parts.push(SCALE_EN[i] ? `${words} ${SCALE_EN[i]}` : words);
    }
  }
  return parts.join(" ");
}

// ---- Arabic ----
const ONES_AR = [
  "",
  "واحد",
  "اثنان",
  "ثلاثة",
  "أربعة",
  "خمسة",
  "ستة",
  "سبعة",
  "ثمانية",
  "تسعة",
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];
const TENS_AR = [
  "",
  "",
  "عشرون",
  "ثلاثون",
  "أربعون",
  "خمسون",
  "ستون",
  "سبعون",
  "ثمانون",
  "تسعون",
];
const HUNDREDS_AR = [
  "",
  "مئة",
  "مئتان",
  "ثلاثمئة",
  "أربعمئة",
  "خمسمئة",
  "ستمئة",
  "سبعمئة",
  "ثمانمئة",
  "تسعمئة",
];
const SCALE_AR = ["", "ألف", "مليون", "مليار"];

function threeDigitsToWordsAr(n) {
  let parts = [];
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  if (hundreds > 0) parts.push(HUNDREDS_AR[hundreds]);
  if (rem >= 20) {
    const tens = Math.floor(rem / 10);
    const ones = rem % 10;
    if (ones > 0) parts.push(ONES_AR[ones]);
    parts.push(TENS_AR[tens]);
  } else if (rem > 0) {
    parts.push(ONES_AR[rem]);
  }
  return parts.join(" و");
}

function numberToWordsAr(num) {
  if (num === 0) return "صفر";
  let groups = [];
  let n = Math.floor(num);
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  let parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] > 0) {
      const words = threeDigitsToWordsAr(groups[i]);
      parts.push(SCALE_AR[i] ? `${words} ${SCALE_AR[i]}` : words);
    }
  }
  return parts.join(" و");
}

// ---- Turkish ----
const ONES_TR = [
  "",
  "Bir",
  "İki",
  "Üç",
  "Dört",
  "Beş",
  "Altı",
  "Yedi",
  "Sekiz",
  "Dokuz",
];
const TENS_TR = [
  "",
  "On",
  "Yirmi",
  "Otuz",
  "Kırk",
  "Elli",
  "Altmış",
  "Yetmiş",
  "Seksen",
  "Doksan",
];
const SCALE_TR = ["", "Bin", "Milyon", "Milyar"];

function threeDigitsToWordsTr(n) {
  let str = "";
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  if (hundreds > 0)
    str += (hundreds > 1 ? ONES_TR[hundreds] + " " : "") + "Yüz";
  if (rem > 0) {
    if (str) str += " ";
    str += TENS_TR[Math.floor(rem / 10)];
    if (rem % 10 > 0) str += (str.endsWith(" ") ? "" : " ") + ONES_TR[rem % 10];
  }
  return str.trim();
}

function numberToWordsTr(num) {
  if (num === 0) return "Sıfır";
  let groups = [];
  let n = Math.floor(num);
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }
  let parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] > 0) {
      const words = threeDigitsToWordsTr(groups[i]);
      // Turkish drops "Bir" before "Bin" (one thousand -> just "Bin")
      if (i === 1 && groups[i] === 1) {
        parts.push(SCALE_TR[i]);
      } else {
        parts.push(SCALE_TR[i] ? `${words} ${SCALE_TR[i]}` : words);
      }
    }
  }
  return parts.join(" ");
}

// ---- amountToWords: replace the MINOR_UNIT_WORDS block and the function itself ----

export function amountToWords(amount, lang, currency, companyLang) {
  const totalCents = Math.round((Number(amount) || 0) * 100);
  const whole = Math.floor(totalCents / 100);
  const cents = totalCents % 100;

  const isCompanyLang = lang === companyLang;
  const currencyName = isCompanyLang ? currency?.name : currency?.latinName;
  const minorName = isCompanyLang
    ? currency?.minorName
    : currency?.minorLatinName;

  if (lang === "ar") {
    const wholeWords = numberToWordsAr(whole);
    let result = `${wholeWords} ${currencyName || ""}`;
    if (cents > 0 && minorName) {
      result += ` و${numberToWordsAr(cents)} ${minorName}`;
    }
    return `${result} فقط لا غير`.trim();
  }

  if (lang === "tr") {
    const wholeWords = numberToWordsTr(whole);
    let result = `${wholeWords} ${currencyName || ""}`;
    if (cents > 0 && minorName) {
      result += ` ${numberToWordsTr(cents)} ${minorName}`;
    }
    return `${result} Yalnız`.trim();
  }

  const wholeWords = numberToWordsEn(whole);
  let result = `${wholeWords} ${currencyName || ""}`;
  if (cents > 0 && minorName) {
    result += ` and ${numberToWordsEn(cents)} ${minorName}`;
  }
  return `${result} Only`.trim();
}
