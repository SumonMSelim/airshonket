// Bilingual strings for AirShonket: English (en) and Bangla (bn).
//
// Every user-facing string the app renders lives here. The advice sentences
// per AQI band and per profile tag are included, so the health guidance shows
// in the chosen language too.
//
// Script: standard Bangla (বাংলা).

export const LANG_KEY = 'airshonket.lang';

export const STRINGS = {
  en: {
    tagline: 'Breathe easy. Know the air.',
    setProfile: 'Set who you are',
    locate: 'Find my location',
    demo: 'Demo: Dhaka',
    locating: 'Finding you...',
    locateDenied: 'Location permission was denied. You can still tap any place on the map.',
    locateUnavailable: 'Could not get your location. You can still tap any place on the map.',
    locateOutside: 'Your location looks to be outside Bangladesh. Showing the map of Bangladesh instead.',
    youAreHere: 'You are here',
    legendTitle: 'Air quality (PM2.5 AQI)',
    legendNote:
      'Brown dots are known brick kilns mapped in OpenStreetMap. They are the biggest winter source of fine particles.',
    coverageNote:
      'Live air monitoring is concentrated around Dhaka. Brick kilns are shown for the whole country.',
    profileTitle: 'Who is this for?',
    profileSub: 'Pick what applies. The advice will fit you.',
    save: 'Save',
    close: 'Close',
    sampleBadge: 'Showing sample air data',
    attribution: 'Air quality: OpenAQ. Kilns: © OpenStreetMap contributors (ODbL).',
    whatToDo: 'What to do',
    nearbySources: 'Nearby sources',
    near: 'Near',
    noReading: 'No air quality station data loaded yet.',
    // {aqi} style placeholders are filled in app.js
    readingSubHere: 'PM2.5 {pm25} µg/m³, at this spot.',
    readingSubAway:
      'PM2.5 {pm25} µg/m³, from the nearest station, about {km} km away ({name}).',
    kilnsLine:
      '{n15} known brick kiln{plural} within 15 km{within5}. Kilns are the biggest winter source of fine particles here.',
    within5: ' ({n5} within 5 km)',
    upwindLine:
      'Wind is from the {dir} today, so {nUp} of them are upwind of you and likely affecting your air right now.',
    upwindNone:
      'Wind is from the {dir} today, so few of them are upwind of you right now.',
    windUnavailable: 'Live wind data is not available right now.',
    medicalNote:
      'Advice is general public guidance based on standard AQI bands, not medical advice.',
    // AQI band labels
    bands: {
      good: 'Good',
      moderate: 'Moderate',
      usg: 'Unhealthy for sensitive groups',
      unhealthy: 'Unhealthy',
      very: 'Very unhealthy',
      hazardous: 'Hazardous',
    },
    // Profile tag labels
    profiles: {
      healthy: 'Healthy adult',
      respiratory: 'Has asthma, heart, or lung condition',
      child: 'Young child at home',
      elderly: 'Elderly',
      outdoor: 'Outdoor worker or cyclist',
    },
    // Base advice per band, as arrays of sentences
    advice: {
      good: ['Air is clean.', 'A good day to open windows and go outside.'],
      moderate: [
        'Air is acceptable for most people.',
        'If you are unusually sensitive, take it easy outdoors.',
      ],
      usg: [
        'Air is unhealthy for sensitive people.',
        'Most people are fine, but sensitive groups should limit long spells outside.',
      ],
      unhealthy: [
        'Air is unhealthy.',
        'Wear a mask outside. Keep windows shut. Use an air purifier if you have one.',
      ],
      very: [
        'Air is very unhealthy.',
        'Avoid outdoor activity. A mask is essential. Seal windows.',
      ],
      hazardous: [
        'Air is hazardous.',
        'Stay indoors. Use an N95 mask if you must go out.',
      ],
    },
    // Profile-specific extra advice lines
    extra: {
      respiratoryRisky:
        'You told us someone has asthma, heart, or lung trouble. Keep rescue medicine close and stay indoors as much as you can.',
      respiratoryMild:
        'If you have asthma, heart, or lung trouble, keep your medicine close.',
      child: 'Keep young children indoors and away from open windows.',
      elderly: 'Older people should rest indoors and avoid any outdoor effort.',
      outdoorUnhealthy:
        'If you work or cycle outside, wear a proper mask and take breaks indoors.',
      outdoorRisky:
        'Avoid outdoor work or cycling today if you possibly can. If you must, wear an N95 mask.',
    },
  },

  bn: {
    tagline: 'স্বস্তিতে শ্বাস নিন। বাতাসের খবর জানুন।',
    setProfile: 'আপনি কে, জানান',
    locate: 'আমার অবস্থান খুঁজুন',
    demo: 'ডেমো: ঢাকা',
    locating: 'খুঁজে দেখা হচ্ছে...',
    locateDenied: 'অবস্থান ব্যবহারের অনুমতি দেওয়া হয়নি। আপনি মানচিত্রের যেকোনো জায়গায় ট্যাপ করতে পারেন।',
    locateUnavailable: 'আপনার অবস্থান পাওয়া যায়নি। আপনি মানচিত্রের যেকোনো জায়গায় ট্যাপ করতে পারেন।',
    locateOutside: 'আপনার অবস্থান বাংলাদেশের বাইরে বলে মনে হচ্ছে। বাংলাদেশের মানচিত্র দেখানো হচ্ছে।',
    youAreHere: 'আপনি এখানে আছেন',
    legendTitle: 'বাতাসের মান (PM2.5 AQI)',
    legendNote:
      'বাদামি বিন্দুগুলো OpenStreetMap-এ চিহ্নিত ইটভাটা। শীতকালে সূক্ষ্ম ধূলিকণার সবচেয়ে বড় উৎস এগুলোই।',
    coverageNote:
      'সরাসরি বাতাস পরিমাপ মূলত ঢাকার আশেপাশে। ইটভাটা দেখানো হয়েছে সারা দেশের।',
    profileTitle: 'এটি কার জন্য?',
    profileSub: 'যা প্রযোজ্য তা বেছে নিন। পরামর্শ আপনার জন্য মানানসই হবে।',
    save: 'সংরক্ষণ করুন',
    close: 'বন্ধ করুন',
    sampleBadge: 'নমুনা বাতাসের তথ্য দেখানো হচ্ছে',
    attribution: 'বাতাসের মান: OpenAQ। ইটভাটা: © OpenStreetMap contributors (ODbL)।',
    whatToDo: 'কী করবেন',
    nearbySources: 'কাছের উৎস',
    near: 'কাছে',
    noReading: 'এখনও বাতাসের কোনো তথ্য আসেনি।',
    readingSubHere: 'PM2.5 {pm25} µg/m³, এই জায়গায়।',
    readingSubAway:
      'PM2.5 {pm25} µg/m³, নিকটতম স্টেশন থেকে, প্রায় {km} কিমি দূরে ({name})।',
    kilnsLine:
      '১৫ কিমির মধ্যে {n15}টি পরিচিত ইটভাটা{within5}। শীতকালে সূক্ষ্ম ধূলিকণার সবচেয়ে বড় উৎস এগুলোই।',
    within5: ' ({n5}টি ৫ কিমির মধ্যে)',
    upwindLine:
      'আজ বাতাস আসছে {dir} দিক থেকে, তাই এর মধ্যে {nUp}টি আপনার উজানে এবং এখন আপনার বাতাসে প্রভাব ফেলছে।',
    upwindNone:
      'আজ বাতাস আসছে {dir} দিক থেকে, তাই এখন খুব কম ভাটাই আপনার উজানে আছে।',
    windUnavailable: 'এই মুহূর্তে সরাসরি বাতাসের দিকের তথ্য পাওয়া যাচ্ছে না।',
    medicalNote:
      'এই পরামর্শ সাধারণ জনস্বাস্থ্য নির্দেশনা, কোনো চিকিৎসা পরামর্শ নয়।',
    bands: {
      good: 'ভালো',
      moderate: 'মোটামুটি',
      usg: 'সংবেদনশীলদের জন্য ক্ষতিকর',
      unhealthy: 'অস্বাস্থ্যকর',
      very: 'খুবই অস্বাস্থ্যকর',
      hazardous: 'বিপজ্জনক',
    },
    profiles: {
      healthy: 'সুস্থ প্রাপ্তবয়স্ক',
      respiratory: 'হাঁপানি, হৃদরোগ বা ফুসফুসের সমস্যা আছে',
      child: 'ঘরে ছোট শিশু আছে',
      elderly: 'বয়স্ক মানুষ',
      outdoor: 'বাইরে কাজ করেন বা সাইকেল চালান',
    },
    advice: {
      good: ['বাতাস পরিষ্কার।', 'জানালা খোলা রাখা ও বাইরে যাওয়ার জন্য ভালো দিন।'],
      moderate: [
        'বেশিরভাগ মানুষের জন্য বাতাস সহনীয়।',
        'আপনি যদি অতিরিক্ত সংবেদনশীল হন, বাইরে বেশি পরিশ্রম করবেন না।',
      ],
      usg: [
        'সংবেদনশীল মানুষের জন্য বাতাস ক্ষতিকর।',
        'বেশিরভাগ মানুষ ঠিক থাকবেন, তবে সংবেদনশীলরা বাইরে বেশি সময় থাকবেন না।',
      ],
      unhealthy: [
        'বাতাস অস্বাস্থ্যকর।',
        'বাইরে মাস্ক পরুন। জানালা বন্ধ রাখুন। থাকলে এয়ার পিউরিফায়ার চালান।',
      ],
      very: [
        'বাতাস খুবই অস্বাস্থ্যকর।',
        'বাইরের কাজকর্ম এড়িয়ে চলুন। মাস্ক অপরিহার্য। জানালা বন্ধ রাখুন।',
      ],
      hazardous: [
        'বাতাস বিপজ্জনক।',
        'ঘরেই থাকুন। বাইরে যেতেই হলে N95 মাস্ক পরুন।',
      ],
    },
    extra: {
      respiratoryRisky:
        'আপনি জানিয়েছেন কারও হাঁপানি, হৃদরোগ বা ফুসফুসের সমস্যা আছে। জরুরি ওষুধ কাছে রাখুন এবং যতটা সম্ভব ঘরে থাকুন।',
      respiratoryMild:
        'হাঁপানি, হৃদরোগ বা ফুসফুসের সমস্যা থাকলে ওষুধ কাছে রাখুন।',
      child: 'ছোট শিশুদের ঘরে রাখুন এবং খোলা জানালা থেকে দূরে রাখুন।',
      elderly: 'বয়স্কদের ঘরে বিশ্রাম নেওয়া উচিত এবং বাইরে পরিশ্রম এড়ানো উচিত।',
      outdoorUnhealthy:
        'বাইরে কাজ করলে বা সাইকেল চালালে ভালো মাস্ক পরুন এবং মাঝে মাঝে ঘরে বিশ্রাম নিন।',
      outdoorRisky:
        'সম্ভব হলে আজ বাইরে কাজ বা সাইকেল চালানো এড়িয়ে চলুন। করতেই হলে N95 মাস্ক পরুন।',
    },
  },
};

/** Pick the initial language: saved choice, else browser, else English. */
export function initialLang() {
  const saved = localStorage.getItem(LANG_KEY);
  if (saved === 'en' || saved === 'bn') return saved;
  const nav = (navigator.language || '').toLowerCase();
  return nav.startsWith('bn') ? 'bn' : 'en';
}

export function saveLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
}
