"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TextService = void 0;
class TextService {
    static getTodayName(desiredLang) {
        const en = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
        const de = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
        const ru = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
        const pt = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];
        const nl = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
        const fr = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
        const it = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
        const es = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
        const pl = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];
        const uk = ["понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота", "неділя"];
        const zh = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
        const dow = (new Date().getDay() + 6) % 7;
        switch (desiredLang) {
            case "en":
                return en[dow];
            case "de":
                return de[dow];
            case "ru":
                return ru[dow];
            case "pt":
                return pt[dow];
            case "nl":
                return nl[dow];
            case "fr":
                return fr[dow];
            case "it":
                return it[dow];
            case "es":
                return es[dow];
            case "uk":
                return uk[dow];
            case "pl":
                return pl[dow];
            case "zh-cn":
                return zh[dow];
        }
        return en[dow];
    }
    static getDateFormat(dateFormat) {
        let sPattern = "/";
        if (!dateFormat.includes(sPattern)) {
            sPattern = "-";
            if (!dateFormat.includes(sPattern)) {
                sPattern = ".";
                if (!dateFormat.includes(sPattern))
                    return "%y/%m/%d";
            }
        }
        let rDate = "";
        for (const val of dateFormat.split(sPattern)) {
            switch (val) {
                case "YYYY":
                    rDate += "%y";
                    break;
                case "YY":
                    rDate += "%y";
                    break;
                case "Y":
                    rDate += "%Y";
                    break;
                case "MMMM":
                    rDate += "%B";
                    break;
                case "MMM":
                    rDate += "%b";
                    break;
                case "MM":
                    rDate += "%m";
                    break;
                case "M":
                    rDate += "%-m";
                    break;
                case "DD":
                    rDate += "%d";
                    break;
                case "D":
                    rDate += "%-d";
                    break;
            }
            rDate = rDate + sPattern;
        }
        rDate = rDate.slice(0, rDate.length - 1);
        return rDate;
    }
}
exports.TextService = TextService;
//# sourceMappingURL=text-service.js.map