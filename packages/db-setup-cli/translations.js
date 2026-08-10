// packages/db-setup-cli/translations.js
// Same pattern as the main-process TRANSLATIONS maps used elsewhere in
// the app (e.g. buildDefaultInvoiceName) — i18next isn't available here
// since this is a standalone script, not a renderer process.

export const TRANSLATIONS = {
  en: {
    languagePrompt:
      "Choose language / اختر اللغة / Dil seçin: 1) English  2) العربية  3) Türkçe",
    title: "NoonPos Database Setup",
    introLine1: "This will set up this machine as a NoonPos database host:",
    introBullet1: "Install a local Postgres database engine",
    introBullet2: "Register it as a background service (starts on boot)",
    introBullet3: "Open the necessary firewall port",
    introBullet4: "Create the NoonPos database and tables",
    confirmPrompt: "Continue?",
    cancelled: "Setup cancelled.",
    setupComplete: "Setup complete!",
    setupFailed: "Setup FAILED",
    connectionSaved: "Connection details saved to:",
    connectionSavedNote:
      "Use this file when setting up other devices to connect to this host.",
    connectionFileTitle: "NoonPos Database Connection Info",
    connectionFileIntro:
      "Use these details when setting up OTHER devices/terminals to connect\nto this machine as the database host.",
    connectionFileHost: "Host:",
    connectionFilePort: "Port:",
    connectionFileDatabase: "Database:",
    connectionFileUser: "User:",
    connectionFilePassword: "Password:",
    connectionFileThisMachine: "<this machine's LAN IP address>",
    multipleIpsNote:
      "(Multiple network adapters detected — use whichever address is on\n" +
      "the same network as your other devices, usually the Wi-Fi one.)",
    connectionFileNote:
      'Note: "Host" above shows 127.0.0.1 because this file was generated on\n' +
      "the host machine itself. On OTHER devices, use this machine's actual\n" +
      "IP address on the local network instead (e.g. 192.168.1.50) — find it\n" +
      'via "ipconfig" (Windows) or "ifconfig"/System Settings (Mac) on this\n' +
      "machine.\n\n" +
      "IMPORTANT: this IP address can change (e.g. after a router restart),\n" +
      "which would break the connection on every other device until updated.\n" +
      "To prevent this, set a static IP or a DHCP reservation for this\n" +
      "machine in your router's settings — ask your network administrator\n" +
      "or technician if you're not sure how.",
    yesNoHint: "(y/n):",
  },

  ar: {
    languagePrompt:
      "Choose language / اختر اللغة / Dil seçin: 1) English  2) العربية  3) Türkçe",
    title: "إعداد قاعدة بيانات نون بوس",
    introLine1: "سيتم إعداد هذا الجهاز كمستضيف لقاعدة بيانات نون بوس:",
    introBullet1: "تثبيت محرك قاعدة بيانات Postgres محلي",
    introBullet2:
      "تسجيله كخدمة تعمل في الخلفية (يبدأ تلقائياً مع تشغيل الجهاز)",
    introBullet3: "فتح المنفذ اللازم في جدار الحماية",
    introBullet4: "إنشاء قاعدة بيانات نون بوس والجداول",
    confirmPrompt: "هل تريد الاستمرار؟",
    cancelled: "تم إلغاء الإعداد.",
    setupComplete: "تم الإعداد بنجاح!",
    setupFailed: "فشل الإعداد",
    connectionSaved: "تم حفظ بيانات الاتصال في:",
    connectionSavedNote:
      "استخدم هذا الملف عند إعداد الأجهزة الأخرى للاتصال بهذا المضيف.",
    connectionFileTitle: "معلومات الاتصال بقاعدة بيانات نون بوس",
    connectionFileIntro:
      "استخدم هذه المعلومات عند إعداد أجهزة أخرى للاتصال\nبهذا الجهاز كمضيف لقاعدة البيانات.",
    connectionFileHost: "المضيف:",
    connectionFilePort: "المنفذ:",
    connectionFileDatabase: "قاعدة البيانات:",
    connectionFileUser: "المستخدم:",
    connectionFilePassword: "كلمة المرور:",
    connectionFileThisMachine: "<عنوان IP لهذا الجهاز على الشبكة المحلية>",
    multipleIpsNote:
      "(تم اكتشاف عدة بطاقات شبكة — استخدم العنوان الموجود على نفس الشبكة\n" +
      "التي تتصل بها أجهزتك الأخرى، وعادة يكون عنوان شبكة Wi-Fi.)",
    connectionFileNote:
      "ملاحظة: تم عرض 127.0.0.1 أعلاه لأن هذا الملف تم إنشاؤه على\n" +
      "جهاز المضيف نفسه. على الأجهزة الأخرى، استخدم عنوان IP الفعلي لهذا\n" +
      "الجهاز على الشبكة المحلية بدلاً منه (مثال: 192.168.1.50) — يمكن معرفته\n" +
      'عبر "ipconfig" (ويندوز) أو "ifconfig"/تفضيلات النظام (ماك) على هذا\n' +
      "الجهاز.\n\n" +
      "مهم: قد يتغير عنوان IP هذا (مثلاً بعد إعادة تشغيل الراوتر)، مما يعطل\n" +
      "الاتصال على جميع الأجهزة الأخرى حتى يتم تحديثه. لتجنب ذلك، قم بتعيين\n" +
      "عنوان IP ثابت أو حجز DHCP لهذا الجهاز من إعدادات الراوتر — استشر\n" +
      "مسؤول الشبكة أو التقني إذا لم تكن متأكداً من كيفية القيام بذلك.",
    yesNoHint: "(y/n):",
  },

  tr: {
    languagePrompt:
      "Choose language / اختر اللغة / Dil seçin: 1) English  2) العربية  3) Türkçe",
    title: "NoonPos Veritabanı Kurulumu",
    introLine1:
      "Bu işlem, bu cihazı bir NoonPos veritabanı sunucusu olarak kuracak:",
    introBullet1: "Yerel bir Postgres veritabanı motoru kurulacak",
    introBullet2:
      "Arka planda çalışan bir servis olarak kaydedilecek (bilgisayar açılışında otomatik başlar)",
    introBullet3: "Gerekli güvenlik duvarı portu açılacak",
    introBullet4: "NoonPos veritabanı ve tabloları oluşturulacak",
    confirmPrompt: "Devam edilsin mi?",
    cancelled: "Kurulum iptal edildi.",
    setupComplete: "Kurulum tamamlandı!",
    setupFailed: "Kurulum BAŞARISIZ",
    connectionSaved: "Bağlantı bilgileri şuraya kaydedildi:",
    connectionSavedNote:
      "Diğer cihazları bu sunucuya bağlarken bu dosyayı kullanın.",
    connectionFileTitle: "NoonPos Veritabanı Bağlantı Bilgileri",
    connectionFileIntro:
      "Diğer cihazları/terminalleri bu makineye veritabanı sunucusu\nolarak bağlarken bu bilgileri kullanın.",
    connectionFileHost: "Sunucu:",
    connectionFilePort: "Port:",
    connectionFileDatabase: "Veritabanı:",
    connectionFileUser: "Kullanıcı:",
    connectionFilePassword: "Şifre:",
    connectionFileThisMachine: "<bu cihazın yerel ağ IP adresi>",
    multipleIpsNote:
      "(Birden fazla ağ adaptörü tespit edildi — diğer cihazlarınızla aynı\n" +
      "ağda olan adresi kullanın, genellikle Wi-Fi adresi olur.)",
    connectionFileNote:
      "Not: Yukarıda 127.0.0.1 görünüyor çünkü bu dosya sunucu\n" +
      "makinenin kendisinde oluşturuldu. DİĞER cihazlarda, bunun yerine\n" +
      "bu makinenin yerel ağdaki gerçek IP adresini kullanın (örn. 192.168.1.50)\n" +
      '— bu makinede "ipconfig" (Windows) veya "ifconfig"/Sistem Ayarları (Mac)\n' +
      "ile bulabilirsiniz.\n\n" +
      "ÖNEMLİ: bu IP adresi değişebilir (örneğin router yeniden başlatıldığında),\n" +
      "bu durum diğer tüm cihazlardaki bağlantıyı güncellenene kadar bozar.\n" +
      "Bunu önlemek için router ayarlarınızdan bu cihaza sabit bir IP adresi\n" +
      "veya DHCP rezervasyonu atayın — nasıl yapılacağından emin değilseniz\n" +
      "ağ yöneticinize veya teknisyeninize danışın.",
    yesNoHint: "(y/n):",
  },
};

export function t(lang, key) {
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
  return dict[key] ?? TRANSLATIONS.en[key] ?? key;
}
