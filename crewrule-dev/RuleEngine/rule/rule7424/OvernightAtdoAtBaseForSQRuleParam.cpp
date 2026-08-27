/**
 * @file OvernightAtdoAtBaseForSQRuleParam.cpp
 */

#include "OvernightAtdoAtBaseForSQRuleParam.h"

#include <algorithm>
#include <sstream>

#include "Log/Logger.h"
#include "StringUtil.h"

#include "../framework/constant/Constants.h"

std::string OvernightAtdoAtBaseForSQRuleParam::NormalizeUpper(const std::string& value) {
    return strToUpper(trim(value));
}

bool OvernightAtdoAtBaseForSQRuleParam::IsIgnoredToken(const std::string& valueUpper) {
    return valueUpper.empty() || valueUpper == "*" || valueUpper == RuleParamConstant::ALL ||
           valueUpper == RuleParamConstant::IGNORED;
}

int OvernightAtdoAtBaseForSQRuleParam::ParseIntOrDefault(const std::string& value, int defaultValue) {
    const std::string t = trim(value);
    if (t.empty()) {
        return defaultValue;
    }
    return atoi(t.c_str());
}

bool OvernightAtdoAtBaseForSQRuleParam::ParseTimeMinutes(const std::string& value, int& outMinutes) {
    const std::string t = trim(value);
    int hh = 0;
    int mm = 0;
    char sep = '\0';
    std::istringstream iss(t);
    iss >> hh >> sep >> mm;
    if (!iss || sep != ':' || hh < 0 || hh > 99 || mm < 0 || mm > 59) {
        return false;
    }
    outMinutes = hh * 60 + mm;
    return true;
}

std::vector<std::string> OvernightAtdoAtBaseForSQRuleParam::SplitPipeUpper(const std::string& value) {
    std::vector<std::string> out;
    std::vector<std::string> tmp;
    const std::string trimmed = trim(value);
    split(trimmed.c_str(), '|', tmp);
    out.reserve(tmp.size());
    for (const auto& t : tmp) {
        const std::string u = strToUpper(trim(t));
        if (!u.empty()) {
            out.push_back(u);
        }
    }
    return out;
}

void OvernightAtdoAtBaseForSQRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);

    _clause.clear();
    _atdoDays = 0;
    _overnightArriveAfterSpecified = false;
    _overnightArriveAfterMinutes = 0;
    _minFdpSpecified = false;
    _minFdpMinutes = 0;
    _finalStartStationsSpecified = false;
    _finalStartStationsUpper.clear();

    auto& parameters = const_cast<DBRule&>(dbRule).params;
    for (auto it = parameters.begin(); it != parameters.end(); ++it) {
        const std::string headerUpper = NormalizeUpper(it->first);
        const std::string value = trim(it->second);
        const std::string valueUpper = NormalizeUpper(it->second);

        if (headerUpper == "CLAUSE") {
            _clause = value;
        } else if (headerUpper == "ATDO DAYS" || headerUpper == "ATDO DAY" || headerUpper == "REST DAYS") {
            _atdoDays = std::max(0, ParseIntOrDefault(value, 0));
        } else if (headerUpper == "OVERNIGHT ARRIVE AFTER" ||
                   headerUpper == "OVERNIGHT ARRIVE AFTER (HH:MM)" ||
                   headerUpper == "ARRIVE AFTER") {
            if (IsIgnoredToken(valueUpper)) {
                _overnightArriveAfterSpecified = false;
                _overnightArriveAfterMinutes = 0;
            } else {
                int minutes = 0;
                if (ParseTimeMinutes(value, minutes)) {
                    _overnightArriveAfterSpecified = true;
                    _overnightArriveAfterMinutes = minutes;
                } else {
                    Logger::getRuleLogger()->warn("Rule 7424 invalid overnight arrive after value: {}", value);
                    _overnightArriveAfterSpecified = false;
                    _overnightArriveAfterMinutes = 0;
                }
            }
        } else if (headerUpper == "MIN FDP" || headerUpper == "FDP") {
            if (IsIgnoredToken(valueUpper)) {
                _minFdpSpecified = false;
                _minFdpMinutes = 0;
            } else {
                int minutes = 0;
                if (ParseTimeMinutes(value, minutes)) {
                    _minFdpSpecified = true;
                    _minFdpMinutes = minutes;
                } else {
                    Logger::getRuleLogger()->warn("Rule 7424 invalid min FDP value: {}", value);
                    _minFdpSpecified = false;
                    _minFdpMinutes = 0;
                }
            }
        } else if (headerUpper == "FINAL START STATIONS" ||
                   headerUpper == "FINAL START STATION" ||
                   headerUpper == "FINAL DEPARTURE STATIONS" ||
                   headerUpper == "FINAL DEPARTURE STATION") {
            if (IsIgnoredToken(valueUpper)) {
                _finalStartStationsSpecified = false;
                _finalStartStationsUpper.clear();
            } else {
                _finalStartStationsUpper = SplitPipeUpper(value);
                _finalStartStationsSpecified = !_finalStartStationsUpper.empty();
            }
        } else {
            Logger::getRuleLogger()->warn("Rule 7424 parameter ignored, header: {}", it->first);
        }
    }
}

bool OvernightAtdoAtBaseForSQRuleParam::IsValid() const {
    return _atdoDays > 0;
}
