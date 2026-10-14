import { COMMUNES } from "./communes"

// The 58 wilayas (2019 division). Order stores "code - French name"; labels follow the UI locale.
export const WILAYAS: [code: string, fr: string, ar: string][] = [
  ["01", "Adrar", "أدرار"], ["02", "Chlef", "الشلف"], ["03", "Laghouat", "الأغواط"], ["04", "Oum El Bouaghi", "أم البواقي"],
  ["05", "Batna", "باتنة"], ["06", "Béjaïa", "بجاية"], ["07", "Biskra", "بسكرة"], ["08", "Béchar", "بشار"],
  ["09", "Blida", "البليدة"], ["10", "Bouira", "البويرة"], ["11", "Tamanrasset", "تمنراست"], ["12", "Tébessa", "تبسة"],
  ["13", "Tlemcen", "تلمسان"], ["14", "Tiaret", "تيارت"], ["15", "Tizi Ouzou", "تيزي وزو"], ["16", "Alger", "الجزائر"],
  ["17", "Djelfa", "الجلفة"], ["18", "Jijel", "جيجل"], ["19", "Sétif", "سطيف"], ["20", "Saïda", "سعيدة"],
  ["21", "Skikda", "سكيكدة"], ["22", "Sidi Bel Abbès", "سيدي بلعباس"], ["23", "Annaba", "عنابة"], ["24", "Guelma", "قالمة"],
  ["25", "Constantine", "قسنطينة"], ["26", "Médéa", "المدية"], ["27", "Mostaganem", "مستغانم"], ["28", "M'Sila", "المسيلة"],
  ["29", "Mascara", "معسكر"], ["30", "Ouargla", "ورقلة"], ["31", "Oran", "وهران"], ["32", "El Bayadh", "البيض"],
  ["33", "Illizi", "إليزي"], ["34", "Bordj Bou Arréridj", "برج بوعريريج"], ["35", "Boumerdès", "بومرداس"], ["36", "El Tarf", "الطارف"],
  ["37", "Tindouf", "تندوف"], ["38", "Tissemsilt", "تيسمسيلت"], ["39", "El Oued", "الوادي"], ["40", "Khenchela", "خنشلة"],
  ["41", "Souk Ahras", "سوق أهراس"], ["42", "Tipaza", "تيبازة"], ["43", "Mila", "ميلة"], ["44", "Aïn Defla", "عين الدفلى"],
  ["45", "Naâma", "النعامة"], ["46", "Aïn Témouchent", "عين تموشنت"], ["47", "Ghardaïa", "غرداية"], ["48", "Relizane", "غليزان"],
  ["49", "Timimoun", "تيميمون"], ["50", "Bordj Badji Mokhtar", "برج باجي مختار"], ["51", "Ouled Djellal", "أولاد جلال"],
  ["52", "Béni Abbès", "بني عباس"], ["53", "In Salah", "عين صالح"], ["54", "In Guezzam", "عين قزام"], ["55", "Touggourt", "تقرت"],
  ["56", "Djanet", "جانت"], ["57", "El M'Ghair", "المغير"], ["58", "El Meniaa", "المنيعة"],
]

export const wilayaValue = ([code, fr]: (typeof WILAYAS)[number]) => `${code} - ${fr}`
export const isWilaya = (v: string) => WILAYAS.some((w) => wilayaValue(w) === v)
// Communes of a stored wilaya value ("16 - Alger" → COMMUNES["16"]); orders store the commune's Latin name.
export const communesOf = (wilaya = "") => COMMUNES[wilaya.slice(0, 2)] ?? []
export const isCommune = (wilaya: string, v: string) => isWilaya(wilaya) && communesOf(wilaya).some(([fr]) => fr === v)

// Algerian mobile: 05/06/07 + 8 digits, also +213 / 00213 prefixes. Stored as 0XXXXXXXXX.
export function normalizePhone(raw: string) {
  const m = raw.replace(/[\s.-]/g, "").match(/^(?:\+213|00213|0)([567]\d{8})$/)
  return m ? `0${m[1]}` : null
}
