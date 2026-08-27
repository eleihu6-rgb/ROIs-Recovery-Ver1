#include "CalculatePairingLabelForSQ.h"

#include "UtilFunc.h"

//所有候选值集合（跳过CP）
const static vector<string> RANK_CPT_FO_FLAGS = { "CA", "CB", "CC", "CD", "CE", "CF", "CG", "CH", "CI", "CJ", "CK", "CL", "CM", "CN", "CO", /* "CP", */
    "CQ", "CR", "CS", "CT", "CU", "CV", "CW", "CX", "CY", "CZ" };

//所有候选值集合
const static vector<string>  RANK_CPT_FLAGS = { "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK", "AL", "AM", "AN", "AO", "AP",
    "AQ", "AR", "AS", "AT", "AU", "AV", "AW", "AX", "AY", "AZ" };

//所有候选值集合（跳过BA）
const static vector<string>  RANK_FO_FLAGS = { /*"BA",*/ "BB", "BC", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BK", "BL", "BM", "BN", "BO", "BP",
    "BQ", "BR", "BS", "BT", "BU", "BV", "BW", "BX", "BY", "BZ" };

//所有候选值集合。DA-ZZ两位大写字母，跳过FO/LC/RP/WL，按首字符分行排列，共594个组合
const static vector<string>  RANK_OTHER_FLAGS = {
    "DA", "DB", "DC", "DD", "DE", "DF", "DG", "DH", "DI", "DJ", "DK", "DL", "DM", "DN", "DO", "DP", "DQ", "DR", "DS", "DT", "DU", "DV", "DW", "DX", "DY", "DZ",
    "EA", "EB", "EC", "ED", "EE", "EF", "EG", "EH", "EI", "EJ", "EK", "EL", "EM", "EN", "EO", "EP", "EQ", "ER", "ES", "ET", "EU", "EV", "EW", "EX", "EY", "EZ",
    "FA", "FB", "FC", "FD", "FE", "FF", "FG", "FH", "FI", "FJ", "FK", "FL", "FM", "FN", "FP", "FQ", "FR", "FS", "FT", "FU", "FV", "FW", "FX", "FY", "FZ",
    "GA", "GB", "GC", "GD", "GE", "GF", "GG", "GH", "GI", "GJ", "GK", "GL", "GM", "GN", "GO", "GP", "GQ", "GR", "GS", "GT", "GU", "GV", "GW", "GX", "GY", "GZ",
    "HA", "HB", "HC", "HD", "HE", "HF", "HG", "HH", "HI", "HJ", "HK", "HL", "HM", "HN", "HO", "HP", "HQ", "HR", "HS", "HT", "HU", "HV", "HW", "HX", "HY", "HZ",
    "IA", "IB", "IC", "ID", "IE", "IF", "IG", "IH", "II", "IJ", "IK", "IL", "IM", "IN", "IO", "IP", "IQ", "IR", "IS", "IT", "IU", "IV", "IW", "IX", "IY", "IZ",
    "JA", "JB", "JC", "JD", "JE", "JF", "JG", "JH", "JI", "JJ", "JK", "JL", "JM", "JN", "JO", "JP", "JQ", "JR", "JS", "JT", "JU", "JV", "JW", "JX", "JY", "JZ",
    "KA", "KB", "KC", "KD", "KE", "KF", "KG", "KH", "KI", "KJ", "KK", "KL", "KM", "KN", "KO", "KP", "KQ", "KR", "KS", "KT", "KU", "KV", "KW", "KX", "KY", "KZ",
    "LA", "LB", "LD", "LE", "LF", "LG", "LH", "LI", "LJ", "LK", "LL", "LM", "LN", "LO", "LP", "LQ", "LR", "LS", "LT", "LU", "LV", "LW", "LX", "LY", "LZ",
    "MA", "MB", "MC", "MD", "ME", "MF", "MG", "MH", "MI", "MJ", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ",
    "NA", "NB", "NC", "ND", "NE", "NF", "NG", "NH", "NI", "NJ", "NK", "NL", "NM", "NN", "NO", "NP", "NQ", "NR", "NS", "NT", "NU", "NV", "NW", "NX", "NY", "NZ",
    "OA", "OB", "OC", "OD", "OE", "OF", "OG", "OH", "OI", "OJ", "OK", "OL", "OM", "ON", "OO", "OP", "OQ", "OR", "OS", "OT", "OU", "OV", "OW", "OX", "OY", "OZ",
    "PA", "PB", "PC", "PD", "PE", "PF", "PG", "PH", "PI", "PJ", "PK", "PL", "PM", "PN", "PO", "PP", "PQ", "PR", "PS", "PT", "PU", "PV", "PW", "PX", "PY", "PZ",
    "QA", "QB", "QC", "QD", "QE", "QF", "QG", "QH", "QI", "QJ", "QK", "QL", "QM", "QN", "QO", "QP", "QQ", "QR", "QS", "QT", "QU", "QV", "QW", "QX", "QY", "QZ",
    "RA", "RB", "RC", "RD", "RE", "RF", "RG", "RH", "RI", "RJ", "RK", "RL", "RM", "RN", "RO", "RQ", "RR", "RS", "RT", "RU", "RV", "RW", "RX", "RY", "RZ",
    "SA", "SB", "SC", "SD", "SE", "SF", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SP", "SQ", "SR", "SS", "ST", "SU", "SV", "SW", "SX", "SY", "SZ",
    "TA", "TB", "TC", "TD", "TE", "TF", "TG", "TH", "TI", "TJ", "TK", "TL", "TM", "TN", "TO", "TP", "TQ", "TR", "TS", "TT", "TU", "TV", "TW", "TX", "TY", "TZ",
    "UA", "UB", "UC", "UD", "UE", "UF", "UG", "UH", "UI", "UJ", "UK", "UL", "UM", "UN", "UO", "UP", "UQ", "UR", "US", "UT", "UU", "UV", "UW", "UX", "UY", "UZ",
    "VA", "VB", "VC", "VD", "VE", "VF", "VG", "VH", "VI", "VJ", "VK", "VL", "VM", "VN", "VO", "VP", "VQ", "VR", "VS", "VT", "VU", "VV", "VW", "VX", "VY", "VZ",
    "WA", "WB", "WC", "WD", "WE", "WF", "WG", "WH", "WI", "WJ", "WK", "WM", "WN", "WO", "WP", "WQ", "WR", "WS", "WT", "WU", "WV", "WW", "WX", "WY", "WZ",
    "XA", "XB", "XC", "XD", "XE", "XF", "XG", "XH", "XI", "XJ", "XK", "XL", "XM", "XN", "XO", "XP", "XQ", "XR", "XS", "XT", "XU", "XV", "XW", "XX", "XY", "XZ",
    "YA", "YB", "YC", "YD", "YE", "YF", "YG", "YH", "YI", "YJ", "YK", "YL", "YM", "YN", "YO", "YP", "YQ", "YR", "YS", "YT", "YU", "YV", "YW", "YX", "YY", "YZ",
    "ZA", "ZB", "ZC", "ZD", "ZE", "ZF", "ZG", "ZH", "ZI", "ZJ", "ZK", "ZL", "ZM", "ZN", "ZO", "ZP", "ZQ", "ZR", "ZS", "ZT", "ZU", "ZV", "ZW", "ZX", "ZY", "ZZ"
};

// SQ positioning pairing complement flags are split by department/service type to avoid upload label conflicts.
const static vector<string> DHD_FD_PAX_FLAGS = { "PZ", "PC", "PF", "PI", "PL", "PO", "PR", "PV" };
const static vector<string> DHD_CC_FLAGS = { "PA", "PD", "PG", "PJ", "PM", "PP", "PT", "PW" };
const static vector<string> DHD_FD_CGO_FLAGS = { "PB", "PE", "PH", "PK", "PN", "PQ", "PU" };

static PairingLabelFieldValue getPairingComplementFlagOfFD(const Pairing* pairing, const int offsetTZMinutes, const CrewDataContext* dbData);

static PairingLabelFieldValue getPairingComplementFlagOfCC(const Pairing* pairing, const int offsetTZMinutes, const CrewDataContext* dbData);

static const Segment* getFirstOperatingSegment(const Pairing* pairing) {
    for (auto duty : pairing->getDutyVec()) {
        for (auto segment : duty->getSegmentsRead()) {
            if (segment->getIsOperating()) {
                return segment;
            }
        }
    }
    return nullptr;
}

static PairingLabelFieldValue getPositioningPairingComplementFlag(const Pairing* pairing, const CrewDataContext* dbData) {
    if (dbData->scenario.division == "C") {
        return { "PX", DHD_CC_FLAGS };
    }

    const Segment* firstOperatingSegment = getFirstOperatingSegment(pairing);
    if (firstOperatingSegment != nullptr && firstOperatingSegment->getServiceType() == "F") {
        return { "PY", DHD_FD_CGO_FLAGS };
    }

    return { "PS", DHD_FD_PAX_FLAGS };
}

//获得距离基地最远机场
static PairingLabelFieldValue getFarthestAirportFromBase(const Pairing* pairing, const int offsetTZMinutes, const CrewDataContext* dbData) {
    string base = pairing->getBase();
    int maxDistance = -1;
    string maxDistanceAirport = base;

    for (auto& duty : pairing->getDutyVec()) {
        for (auto& segment : duty->getSegmentsRead()) {
            auto& depAirport = segment->getDepStationRead();
            auto& arrAirport = segment->getArrStationRead();

            if (depAirport != base) {
                int depDistance = dbData->getDistanceBetweenAirports(base, depAirport);
                if (depDistance > maxDistance) {
                    maxDistance = depDistance;
                    maxDistanceAirport = depAirport;
                }
            }

            if (arrAirport != base) {
                int arrDistance = dbData->getDistanceBetweenAirports(base, arrAirport);
                if (arrDistance > maxDistance) {
                    maxDistance = arrDistance;
                    maxDistanceAirport = arrAirport;
                }
            }
        }

    }
    return { maxDistanceAirport, vector<string>() };
}

//获得Pairing中第一个leg departure日期（SIN时区）对应的day of week，周一赋值1，周二赋值2……周日赋值7
static PairingLabelFieldValue getDayOfWeekOfFirstLegDeparture(const Pairing* pairing, const int offsetTZMinutes, const CrewDataContext* dbData) {
    if (pairing->getNumDuties() == 0) {
        return { "", vector<string>() };
    }
    Duty* firstDuty = pairing->getDuty(0);
    if (firstDuty->getNumSegments() == 0) {
        return { "", vector<string>()};
    }
    auto firstSegment = firstDuty->getFirstSegment();
    time_t depTimeLocal = firstSegment->getStartTimeLocSch();
    struct tm* timeinfo = gmtime(&depTimeLocal);
    int dayOfWeek = timeinfo->tm_wday; // tm_wday: days since Sunday [0-6]
    if (dayOfWeek == 0) {
        dayOfWeek = 7; // Convert Sunday from 0 to 7
    }
    return { std::to_string(dayOfWeek), vector<string>() };
}


//获得Pairing Complement标志
static PairingLabelFieldValue getPairingComplementFlag(const Pairing* pairing, const int offsetTZMinutes, const CrewDataContext* dbData) {
    bool isDHD = false;
    if (pairing->getNumDuties() > 0) {
        auto firstDuty = pairing->getDuty(0);
        if (firstDuty->getAssignment() == "MVP" || firstDuty->getAssignment() == "BUS" || firstDuty->getAssignment() == "TRAIN" || firstDuty->getAssignment() == "HSR") {
            isDHD = true;
        }
    }
    if (!isDHD) {
        const static string RANK_CPT = "CPT";
        const static string RANK_FO = "FO";

        bool isCPT = false, isFO = false;
        for (auto& rankValue : const_cast<Pairing*>(pairing)->getComplements()) {
            if (rankValue.first == RANK_CPT && rankValue.second == 1) {
                isCPT = true;
            }
            else if (rankValue.first == RANK_FO && rankValue.second == 1) {
                isFO = true;
            }
        }
        if (isCPT && isFO) {
            return { "  " , RANK_CPT_FO_FLAGS };
        }
        else if (isCPT) {
            return { "CP", RANK_CPT_FLAGS };
        }
        else if (isFO) {
            return { "FO", RANK_FO_FLAGS };
        }
        return { "DA", RANK_OTHER_FLAGS };
    }
    else {
        return getPositioningPairingComplementFlag(pairing, dbData);
    }
}

//获得航司二字码和第一个Leg的Airline+FlightNum
static PairingLabelFieldValue getFirstFlightNumOfPairing(const Pairing* pairing, const int offsetTZMinutes, const CrewDataContext* dbData) {
    auto firstSegment = pairing->getFirstSegment();
    if (firstSegment == nullptr) {
        return { "", vector<string>()};
    }
    std::string airlineCode = firstSegment->getAirline();
    std::string flightNum = padLeft(firstSegment->getFlightNumber(), 4, '0');
    return { airlineCode + flightNum, vector<string>() };
}

//Pairing中第一个Leg的flightDate，格式为：DDMMYY（如：080925）
static PairingLabelFieldValue getFirstFlightDateOfPairing(const Pairing* pairing, const int offsetTZMinutes, const CrewDataContext* dbData) {
    auto firstSegment = pairing->getFirstSegment();
    if (firstSegment == nullptr) {
        return { "", vector<string>() };
    }
    auto iterFlt = dbData->flightIdMap.find(firstSegment->getDBId());
    if (iterFlt == dbData->flightIdMap.end()) {
        return { "", vector<string>() };
    }
    time_t fltDate = utcStrToUtc((char*)iterFlt->second->getDate().c_str());
    if (fltDate < 0) {
        return { "", vector<string>() };
    }

    struct tm* timeinfo = gmtime(&fltDate);
    if (timeinfo == nullptr) {
        return { "", vector<string>() }; // 转换失败返回空字符串
    }

    char buffer[7] = "";
    snprintf(buffer, sizeof(buffer), "%02d%02d%02d",
        timeinfo->tm_mday,          // 日（DD）
        timeinfo->tm_mon + 1,       // 月（MM，tm_mon 0-11）
        timeinfo->tm_year - 100);   // 年（YY，tm_year=1900+年份）

    return { std::string(buffer), vector<string>() };
}

inline bool equalsFieldValues(const string& fieldValueA, const string& fieldValueB, const size_t fieldIndex, const CrewDataContext* dbData) {
    if (fieldValueA == fieldValueB) {
        return true;
    }
    if (fieldIndex == 3) {
        //Label 第5-6位：Pairing Complement标志 特殊比较规则
        auto& compFlagA = fieldValueA;
        auto& compFlagB = fieldValueB;

        if (std::find(RANK_CPT_FO_FLAGS.begin(), RANK_CPT_FO_FLAGS.end(), compFlagA) != RANK_CPT_FO_FLAGS.end()
            && std::find(RANK_CPT_FO_FLAGS.begin(), RANK_CPT_FO_FLAGS.end(), compFlagB) != RANK_CPT_FO_FLAGS.end()) {
            return true;
        }

        if (std::find(RANK_CPT_FLAGS.begin(), RANK_CPT_FLAGS.end(), compFlagA) != RANK_CPT_FLAGS.end()
            && std::find(RANK_CPT_FLAGS.begin(), RANK_CPT_FLAGS.end(), compFlagB) != RANK_CPT_FLAGS.end()) {
            return true;
        }

        if (std::find(RANK_FO_FLAGS.begin(), RANK_FO_FLAGS.end(), compFlagA) != RANK_FO_FLAGS.end()
            && std::find(RANK_FO_FLAGS.begin(), RANK_FO_FLAGS.end(), compFlagB) != RANK_FO_FLAGS.end()) {
            return true;
        }

        if (std::find(RANK_OTHER_FLAGS.begin(), RANK_OTHER_FLAGS.end(), compFlagA) != RANK_OTHER_FLAGS.end()
            && std::find(RANK_OTHER_FLAGS.begin(), RANK_OTHER_FLAGS.end(), compFlagB) != RANK_OTHER_FLAGS.end()) {
            return true;
        }

        return false;

    }
    return false;
}

bool CalculatePairingLabelForSQ::equalsLabel(const string& oldPairingLabel, const std::shared_ptr<PairingLabel>& pairingLabel) const {
    if (oldPairingLabel == pairingLabel->getLabel()) {
        return true;
    }
    // SQ特殊规则,针对候选码进行比较是否相等
    auto splitA = PairingLabel::splitLabel(oldPairingLabel);

    auto newLabelList = pairingLabel->getAllCandidateLabel();
    newLabelList.emplace_back(pairingLabel->getLabel());

    //与labelBList中任何一个相等即可
    for(auto& newLabel : newLabelList) {
        auto splitB = PairingLabel::splitLabel(newLabel);
        if (splitA.size() != splitB.size()) {
            continue;
        }
        bool matched = true;
        for (size_t i = 0; i < splitA.size(); i++) {
            if (!equalsFieldValues(splitA[i], splitB[i], i, _dbData)) {
                matched = false;
                break;
            }
        }
        if (matched) {
            return true;
        }
    }

    return false;
}

std::vector<std::shared_ptr<PairingLabelFieldDef>> getFieldDefsForSQ() {
    std::vector<std::shared_ptr<PairingLabelFieldDef>> fieldDefs;
    //第1-3位：Pairing中离SIN最远的机场三字码
    auto fieldDef = std::make_shared<PairingLabelFieldDef>(PairingLabelFieldDef({ "FAR_APT" , getFarthestAirportFromBase }));
    fieldDefs.emplace_back(fieldDef);

    //第4位：Pairing中第一个leg departure日期对应的day of week，周一赋值1，周二赋值2……周日赋值7
    fieldDef = std::make_shared<PairingLabelFieldDef>(PairingLabelFieldDef({ "DAY_OF_WK" , getDayOfWeekOfFirstLegDeparture }));
    fieldDefs.emplace_back(fieldDef);

    //第5-6位：Pairing Complement标志
    fieldDef = std::make_shared<PairingLabelFieldDef>(PairingLabelFieldDef({ "COMPL" , getPairingComplementFlag }));
    fieldDefs.emplace_back(fieldDef);

    //第7-12位：航司二字码+Pairing中第一个Leg的Airline+FlightNum
    fieldDef = std::make_shared<PairingLabelFieldDef>(PairingLabelFieldDef({ "AIRLINE_FLTNUM" , getFirstFlightNumOfPairing }));
    fieldDefs.emplace_back(fieldDef);

    //第13-18位：Pairing中第一个Leg的flightDate，格式为：DDMMYY（如：080925）
    fieldDef = std::make_shared<PairingLabelFieldDef>(PairingLabelFieldDef({ "FLT_DT" , getFirstFlightDateOfPairing }));
    fieldDefs.emplace_back(fieldDef);
    return fieldDefs;
}
