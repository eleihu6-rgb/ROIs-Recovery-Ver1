/**
 * @file AcopSlipPatternRuleParam.cpp
 */

#include "AcopSlipPatternRuleParam.h"

#include <algorithm>
#include <cctype>
#include <sstream>

#include "Log/Logger.h"
#include "StringUtil.h"

#include "../framework/constant/Constants.h"
#include "../framework/utils/TimeUtils.h"

namespace {

constexpr int kMinutesInDay = 24 * 60;

std::string normalizeUpperTrim(const std::string& value) {
    return strToUpper(trim(value));
}

bool isAllToken(const std::string& trimmed) {
    return trimmed.empty() || trimmed == "*" || trimmed == RuleParamConstant::ALL ||
           trimmed == RuleParamConstant::IGNORED;
}

}  // namespace

namespace {

int parseFirstPositiveInt(const std::string& s, int defaultValue) {
    std::string digits;
    for (char c : s) {
        if (std::isdigit(static_cast<unsigned char>(c))) {
            digits.push_back(c);
        } else if (!digits.empty()) {
            break;
        }
    }
    if (digits.empty()) {
        return defaultValue;
    }
    const int v = atoi(digits.c_str());
    return v > 0 ? v : defaultValue;
}

bool parseLeadingDurationMinutes(const std::string& sUpper, int* minutesOut, std::size_t* consumedOut) {
    if (minutesOut == nullptr || consumedOut == nullptr) {
        return false;
    }
    *minutesOut = 0;
    *consumedOut = 0;

    const std::string trimmed = trim(sUpper);
    std::size_t i = 0;
    if (trimmed.rfind("<=", 0) == 0) {
        i = 2;
    } else if (trimmed.rfind(std::string(u8"\u2264"), 0) == 0) {
        i = std::string(u8"\u2264").size();
    } else {
        return false;
    }

    while (i < trimmed.size() && std::isspace(static_cast<unsigned char>(trimmed[i]))) {
        ++i;
    }

    std::string hoursDigits;
    while (i < trimmed.size() && std::isdigit(static_cast<unsigned char>(trimmed[i]))) {
        hoursDigits.push_back(trimmed[i]);
        ++i;
    }
    if (hoursDigits.empty()) {
        return false;
    }

    int hours = atoi(hoursDigits.c_str());
    int minutes = 0;
    if (i < trimmed.size() && trimmed[i] == ':') {
        ++i;
        std::string minutesDigits;
        while (i < trimmed.size() && std::isdigit(static_cast<unsigned char>(trimmed[i]))) {
            minutesDigits.push_back(trimmed[i]);
            ++i;
        }
        if (!minutesDigits.empty()) {
            minutes = atoi(minutesDigits.c_str());
        }
    }

    while (i < trimmed.size() && std::isalpha(static_cast<unsigned char>(trimmed[i]))) {
        ++i;
    }

    while (i < trimmed.size() && std::isspace(static_cast<unsigned char>(trimmed[i]))) {
        ++i;
    }

    if (hours <= 0) {
        return false;
    }
    if (minutes < 0 || minutes >= 60) {
        minutes = 0;
    }

    *minutesOut = hours * 60 + minutes;
    *consumedOut = i;
    return true;
}

std::vector<std::vector<std::string>> parseDutyInPaths(const std::string& tokenUpper) {
    std::vector<std::vector<std::string>> allowedPaths;
    const std::size_t l = tokenUpper.find('(');
    const std::size_t r = tokenUpper.find(')');
    if (l == std::string::npos || r == std::string::npos || r <= l) {
        return allowedPaths;
    }

    const std::string inner = tokenUpper.substr(l + 1, r - l - 1);
    std::vector<std::string> items;
    split(inner.c_str(), ';', items);
    for (auto& item : items) {
        std::vector<std::string> legs;
        split(trim(item).c_str(), '-', legs);
        if (!legs.empty()) {
            for (auto& s : legs) {
                s = strToUpper(trim(s));
            }
            allowedPaths.push_back(std::move(legs));
        }
    }
    return allowedPaths;
}

bool matchesDutyInPaths(const Duty& duty, const std::vector<std::vector<std::string>>& allowedPaths) {
    std::vector<std::string> path;
    for (auto* seg : duty.getSegmentsRead()) {
        if (seg == nullptr || !seg->getIsOperating()) {
            continue;
        }
        if (path.empty()) {
            path.push_back(seg->getDepStation());
        }
        path.push_back(seg->getArrStation());
    }
    if (path.empty()) {
        return false;
    }
    for (const auto& allowed : allowedPaths) {
        if (allowed.size() != path.size()) {
            continue;
        }
        bool ok = true;
        for (std::size_t idx = 0; idx < allowed.size(); ++idx) {
            if (allowed[idx] != path[idx]) {
                ok = false;
                break;
            }
        }
        if (ok) {
            return true;
        }
    }
    return false;
}

bool dutyIsWithinLocation(const Duty& duty, const AcopLocationExpr& location, const CrewDataContext* dbData) {
    if (location.type == AcopLocationExpr::Type::Any) {
        return true;
    }

    bool sawSegment = false;
    for (auto* seg : duty.getSegmentsRead()) {
        if (seg == nullptr) {
            continue;
        }
        sawSegment = true;
        if (!location.MatchesAirport(seg->getDepStation(), dbData) || !location.MatchesAirport(seg->getArrStation(), dbData)) {
            return false;
        }
    }
    if (sawSegment) {
        return true;
    }

    return location.MatchesAirport(duty.getDepartureStation(), dbData) && location.MatchesAirport(duty.getArrivalStation(), dbData);
}

bool startsWithKeyword(const std::string& sUpper, std::size_t pos, const char* kwUpper) {
    const std::size_t n = std::strlen(kwUpper);
    if (pos + n > sUpper.size()) {
        return false;
    }
    return sUpper.compare(pos, n, kwUpper) == 0;
}

bool isAllowedDutyClauseStart(const std::string& sUpper, std::size_t pos) {
    return startsWithKeyword(sUpper, pos, "POS") ||
           startsWithKeyword(sUpper, pos, "FDP") ||
           startsWithKeyword(sUpper, pos, "DUTY");
}

std::vector<std::string> splitAllowedDutyClausesUpper(const std::string& rawValue) {
    std::string trimmed = trim(rawValue);
    std::string upper = strToUpper(trimmed);
    std::vector<std::string> out;
    if (upper.empty()) {
        return out;
    }

    std::size_t start = 0;
    int depth = 0;
    for (std::size_t i = 0; i < upper.size(); ++i) {
        const char c = upper[i];
        if (c == '(') {
            ++depth;
            continue;
        }
        if (c == ')') {
            if (depth > 0) {
                --depth;
            }
            continue;
        }
        if (c != '|' || depth != 0) {
            continue;
        }

        std::size_t next = i + 1;
        while (next < upper.size() && std::isspace(static_cast<unsigned char>(upper[next]))) {
            ++next;
        }

        // Disambiguate "POS in (AU~PER)|NZ" (location expr pipe) vs "POS | FDP <=6h" (clause separator)
        // by checking if the token after the pipe begins with a known clause keyword.
        if (!isAllowedDutyClauseStart(upper, next)) {
            continue;
        }

        const std::string part = trim(upper.substr(start, i - start));
        if (!part.empty()) {
            out.push_back(part);
        }
        start = next;
        i = next > 0 ? (next - 1) : i;
    }

    const std::string tail = trim(upper.substr(start));
    if (!tail.empty()) {
        out.push_back(tail);
    }
    return out;
}

}  // namespace

bool AcopAllowedDutyWithinSlip::IsNonStandbyDutyAllowed(const Duty& duty, const CrewDataContext* dbData) const {
    if (disallowAll) {
        return false;
    }
    if (anyOf.empty()) {
        return true;
    }
    const std::string assignment = duty.getAssignment();

    for (const auto& c : anyOf) {
        if (c.type == AcopAllowedDutyWithinSlipConstraint::Type::Pos) {
            if (assignment == "MVP") {
                return true;
            }
            continue;
        }

        if (c.type == AcopAllowedDutyWithinSlipConstraint::Type::PosInLocation) {
            if (assignment != "MVP") {
                continue;
            }
            if (c.maxDurationMinutes > 0) {
                const time_t s = duty.getStartTimeLocAct();
                const time_t e = duty.getEndTimeLocAct();
                const int durMin = (s > 0 && e > s) ? static_cast<int>((e - s) / 60) : 0;
                if (durMin <= 0 || durMin > c.maxDurationMinutes) {
                    continue;
                }
            }
            if (dutyIsWithinLocation(duty, c.location, dbData)) {
                return true;
            }
            continue;
        }

        if (c.type == AcopAllowedDutyWithinSlipConstraint::Type::FdpMaxDuration) {
            bool hasOperating = false;
            for (auto* seg : duty.getSegmentsRead()) {
                if (seg != nullptr && seg->getIsOperating()) {
                    hasOperating = true;
                    break;
                }
            }
            const time_t s = duty.getStartTimeLocAct();
            const time_t e = duty.getEndTimeLocAct();
            const long fdpSeconds = duty.getFDPInSecs();
            const int fdpMinutes = static_cast<int>(fdpSeconds / 60);

            if (!hasOperating || fdpMinutes <= 0) {
                continue;
            }
            if (c.maxDurationMinutes > 0 && fdpMinutes > c.maxDurationMinutes) {
                continue;
            }
            if (!dutyIsWithinLocation(duty, c.location, dbData)) {
                continue;
            }
            return true;
            continue;
        }

        if (c.type == AcopAllowedDutyWithinSlipConstraint::Type::DutyInPaths) {
            if (matchesDutyInPaths(duty, c.allowedPaths)) {
                return true;
            }
            continue;
        }

        if (c.type == AcopAllowedDutyWithinSlipConstraint::Type::DutyInLocation) {
            if (dutyIsWithinLocation(duty, c.location, dbData)) {
                return true;
            }
            continue;
        }
    }

    return false;
}

void AcopSlipPatternRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    if (dbRule.severity > 0) {
        this->SetSeverity(underlying_to_enum<ViolationSeverity>(dbRule.severity));
    }

    auto& parameters = const_cast<DBRule&>(dbRule).params;
    for (auto it = parameters.begin(); it != parameters.end(); ++it) {
        const std::string headerUpper = strToUpper(trim(it->first));
        const std::string value = trim(it->second);

        if (headerUpper == "CLAUSE") {
            _clause = value;
        } else if (headerUpper == "GROUP") {
            ParseGroup(value);
        } else if (headerUpper == "PATTERN" ||
                   headerUpper == "COP / APPLICABILITY" || headerUpper == "COP" || headerUpper == "APPLICABILITY") {
            ParseCopApplicability(value);
        } else if (headerUpper == "SLIP STATION") {
            ParseSlipStation(value);
        } else if (headerUpper == "PRIORITY") {
            ParsePriority(value);
        } else if (headerUpper == "SLIP ARR IS OPERATING" ||
                   headerUpper == "SLIP ARRIVAL IS OPERATING" ||
                   headerUpper == "SLIP ARRIVAL DUTY IS OPERATING") {
            ParseSlipArrIsOperating(value);
        } else if (headerUpper == "SLIP DEP IS OPERATING" ||
                   headerUpper == "SLIP DEPART IS OPERATING" ||
                   headerUpper == "SLIP DEPARTURE IS OPERATING" ||
                   headerUpper == "SLIP DEPART DUTY IS OPERATING") {
            ParseSlipDepIsOperating(value);
        } else if (headerUpper == "SLIP ARR FLIGHT NO" ||
                   headerUpper == "SLIP ARRIVE FLIGHT NO" ||
                   headerUpper == "SLIP ARRIVAL FLIGHT NO" ||
                   headerUpper == "SLIP ARR FLIGHT NUMBER" ||
                   headerUpper == "SLIP ARRIVE FLIGHT NUMBER" ||
                   headerUpper == "SLIP ARRIVAL FLIGHT NUMBER") {
            ParseSlipArrFlightNo(value);
        } else if (headerUpper == "SLIP DEP FLIGHT NO" ||
                   headerUpper == "SLIP DEPART FLIGHT NO" ||
                   headerUpper == "SLIP DEPARTURE FLIGHT NO" ||
                   headerUpper == "SLIP DEP FLIGHT NUMBER" ||
                   headerUpper == "SLIP DEPART FLIGHT NUMBER" ||
                   headerUpper == "SLIP DEPARTURE FLIGHT NUMBER") {
            ParseSlipDepFlightNo(value);
        } else if (headerUpper == "DUTY ASSIGNMENT BEFORE SLIP" || headerUpper == "DUTY BEFORE") {
            ParseDutyBefore(value);
        } else if (headerUpper == "DUTY ASSIGNMENT AFTER SLIP" || headerUpper == "DUTY AFTER") {
            ParseDutyAfter(value);
        } else if (headerUpper == "REPORTING TIME AT BASE" || headerUpper == "REPORT TIME AT BASE") {
            ParseReportTimeWindow(value);
        } else if (headerUpper == "DEPARTURE TIME AT BASE" || headerUpper == "DEPART TIME AT BASE") {
            ParseDepartureTimeAtBaseWindow(value);
        } else if (headerUpper == "PREVIOUS SLIP LOCAL NIGHTS") {
            ParsePrevSlipLocalNights(value);
        } else if (headerUpper == "PREVIOUS SLIP HAD STANDBY") {
            ParsePrevSlipHadStandby(value);
        } else if (headerUpper == "MIN SLIP HOURS") {
            ParseMinSlipHours(value);
        } else if (headerUpper == "MAX SLIP HOURS") {
            ParseMaxSlipHours(value);
        } else if (headerUpper == "MIN SLIP LOCAL NIGHTS") {
            ParseMinSlipLocalNights(value);
        } else if (headerUpper == "MIN SLIP DEP TIME AFTER LN" ||
                   headerUpper == "MIN SLIP DEP TIME AFTER LOCAL NIGHTS") {
            ParseSlipDepartDutyReportTime(value);
        } else if (headerUpper == "SLIP DEPART DUTY REPORT TIME" ||
                   headerUpper == "SLIP DEPART DUTY START TIME" ||
                   headerUpper == "SLIP DEPART REPORT TIME" ||
                   headerUpper == "DEPART DUTY REPORT TIME") {
            ParseSlipDepartDutyReportTime(value);
        } else if (headerUpper == "DUTY AFTER HOURS") {
            ParseDutyAfterHours(value);
        } else if (headerUpper == "DUTY AFTER LOCAL NIGHTS") {
            ParseDutyAfterLocalNights(value);
        } else if (headerUpper == "DUTY TIME AFTER LN" ||
                   headerUpper == "DUTY TIME AFTER LOCAL NIGHTS") {
            ParseDutyAfterLocalTime(value);
        } else if (headerUpper == "DUTY AFTER LOCAL TIME") {
            ParseDutyAfterLocalTime(value);
        } else if (headerUpper == "MAX STANDBY PERIODS") {
            ParseMaxStandbyPeriods(value);
        } else if (headerUpper == "MAX STANDBY HOURS") {
            ParseMaxStandbyHours(value);
        } else if (headerUpper == "ALLOWED DUTY WITHIN SLIP") {
            ParseAllowedDutyWithinSlip(value);
        } else if (headerUpper == "DO AFTER DUTY") {
            ParseDoAfterDuty(value);
        } else if (headerUpper == "EXTRA CONDITION") {
            ParseExtraCondition(value);
        } else if (headerUpper == "SEVERITY") {
            if (!value.empty()) {
                this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(value.c_str())));
            }
        } else {
            Logger::getRuleLogger()->warn("Rule 7421 parameter ignored, header: {}", it->first);
        }
    }
}

namespace {
constexpr const char* kUlrDutyToken = "ULR_DUTY";
constexpr const char* kUlrEquivalentPosToken = "ULR_EQUIVALENT_POS";
}

bool AcopSlipPatternRuleParam::MatchesDutyBefore(
    const Duty& duty,
    const std::function<bool(const Duty&)>& isUlrEquivalentPositioningDuty) const {
    if (_dutyBefore.empty()) {
        return true;
    }

    const std::string assignment = duty.getAssignment();
    for (const auto& token : _dutyBefore) {
        if (token == kUlrDutyToken) {
            if (duty.isULR()) {
                return true;
            }
            continue;
        }
        if (token == kUlrEquivalentPosToken) {
            if (isUlrEquivalentPositioningDuty && isUlrEquivalentPositioningDuty(duty)) {
                return true;
            }
            continue;
        }
        if (!assignment.empty() && token == assignment) {
            return true;
        }
    }

    return false;
}

bool AcopSlipPatternRuleParam::MatchesDutyAfter(
    const Duty& duty,
    const std::function<bool(const Duty&)>& isUlrEquivalentPositioningDuty) const {
    if (_dutyAfter.empty()) {
        return true;
    }

    const std::string assignment = duty.getAssignment();
    for (const auto& token : _dutyAfter) {
        if (token == kUlrDutyToken) {
            if (duty.isULR()) {
                return true;
            }
            continue;
        }
        if (token == kUlrEquivalentPosToken) {
            if (isUlrEquivalentPositioningDuty && isUlrEquivalentPositioningDuty(duty)) {
                return true;
            }
            continue;
        }
        if (!assignment.empty() && token == assignment) {
            return true;
        }
    }

    return false;
}

bool AcopSlipPatternRuleParam::MatchesSlipArrFlightNo(const Duty& arriveDuty, const CrewDataContext* dbData) const {
    if (_slipArrFlightNoTokens.empty()) {
        return true;
    }

    const std::string scenarioAirlineUpper =
        (dbData == nullptr) ? "" : (dbData->scenario.airline);

    for (auto* seg : arriveDuty.getSegmentsRead()) {
        if (seg == nullptr) {
            continue;
        }

        const std::string segAirlineUpper = (seg->getAirline());
        const std::string segFlightNoUpper = (seg->getFlightNumber());
        for (const auto& token : _slipArrFlightNoTokens) {
            const std::string expectedAirlineUpper = token.hasAirline ? token.airlineUpper : scenarioAirlineUpper;
            if (expectedAirlineUpper.empty()) {
                continue;
            }
            if (segAirlineUpper != expectedAirlineUpper) {
                continue;
            }
            if (segFlightNoUpper == token.flightNumberUpper) {
                return true;
            }
        }
    }

    return false;
}

bool AcopSlipPatternRuleParam::MatchesSlipDepFlightNo(const Duty& departDuty, const CrewDataContext* dbData) const {
    if (_slipDepFlightNoTokens.empty()) {
        return true;
    }

    const std::string scenarioAirlineUpper =
        (dbData == nullptr) ? "" : (dbData->scenario.airline);

    for (auto* seg : departDuty.getSegmentsRead()) {
        if (seg == nullptr) {
            continue;
        }

        const std::string segAirlineUpper = (seg->getAirline());
        const std::string segFlightNoUpper = (seg->getFlightNumber());
        for (const auto& token : _slipDepFlightNoTokens) {
            const std::string expectedAirlineUpper = token.hasAirline ? token.airlineUpper : scenarioAirlineUpper;
            if (expectedAirlineUpper.empty()) {
                continue;
            }
            if (segAirlineUpper != expectedAirlineUpper) {
                continue;
            }
            if (segFlightNoUpper == token.flightNumberUpper) {
                return true;
            }
        }
    }

    return false;
}

bool AcopSlipPatternRuleParam::MatchesReportTimeAtBase(time_t reportTimeLoc) const {
    return _reportTimeWindow.Matches(reportTimeLoc);
}

bool AcopSlipPatternRuleParam::MatchesDepartureTimeAtBase(time_t departTimeLoc) const {
    return _departureTimeAtBaseWindow.Matches(departTimeLoc);
}

bool AcopSlipPatternRuleParam::ReportTimeWindow::Matches(time_t reportTimeLoc) const {
    if (allowAny) {
        return true;
    }
    if (reportTimeLoc <= 0) {
        return false;
    }
    return TimeUtils::IsTimesInRange(reportTimeLoc, startMinutes, endMinutes);
}

std::string AcopSlipPatternRuleParam::NormalizeDashes(std::string value) {
    const std::vector<std::string> dashes = {
        std::string(u8"\u2013"),  // en dash
        std::string(u8"\u2014"),  // em dash
        std::string(u8"\u2212"),  // minus sign
    };
    for (const auto& dash : dashes) {
        std::string::size_type pos = 0;
        while ((pos = value.find(dash, pos)) != std::string::npos) {
            value.replace(pos, dash.size(), "-");
            pos += 1;
        }
    }
    return value;
}

std::string AcopSlipPatternRuleParam::NormalizeUpper(const std::string& value) {
    return normalizeUpperTrim(value);
}

int AcopSlipPatternRuleParam::ParseTimeMinutes(const std::string& value) {
    std::string trimmedValue = trim(value);
    if (trimmedValue.empty()) {
        return -1;
    }
    if (trimmedValue.size() == 4 &&
        std::all_of(trimmedValue.begin(), trimmedValue.end(), [](unsigned char c) { return std::isdigit(c); })) {
        trimmedValue.insert(trimmedValue.begin() + 2, ':');
    }
    return TimeUtils::hhmmToMinutes(trimmedValue);
}

int AcopSlipPatternRuleParam::ParseDurationMinutesOrUnconstrained(const std::string& value, int unconstrainedValue) {
    std::string trimmedValue = trim(value);
    if (isAllToken(trimmedValue)) {
        return unconstrainedValue;
    }
    if (trimmedValue.empty()) {
        return 0;
    }
    if (trimmedValue[0] == '-') {
        return -1;
    }

    if (trimmedValue.find(':') != std::string::npos) {
        const int minutes = TimeUtils::hhmmToMinutes(trimmedValue);
        return minutes >= 0 ? minutes : 0;
    }

    if (std::all_of(trimmedValue.begin(), trimmedValue.end(),
                    [](unsigned char c) { return std::isdigit(c); })) {
        return atoi(trimmedValue.c_str()) * 60;
    }

    return 0;
}

int AcopSlipPatternRuleParam::ParseIntOrDefault(const std::string& value, int defaultValue) {
    const std::string trimmedValue = trim(value);
    if (isAllToken(trimmedValue)) {
        return defaultValue;
    }
    return atoi(trimmedValue.c_str());
}

int AcopSlipPatternRuleParam::ParseIntOrUnconstrained(const std::string& value, int unconstrainedValue) {
    const std::string trimmedValue = trim(value);
    if (isAllToken(trimmedValue)) {
        return unconstrainedValue;
    }
    return atoi(trimmedValue.c_str());
}

void AcopSlipPatternRuleParam::ParseCopApplicability(const std::string& value) {
    _copApplicabilityRaw = value;
    _copPattern = AcopCopPattern{};

    std::string normalized = NormalizeDashes(trim(value));
    if (normalized.empty() || normalized == "*") {
        return;
    }

    const std::string upper = strToUpper(normalized);
    const std::string markerSingle = "IN SINGLE FDP";
    const std::string markerFlight = "FLIGHT";

    if (upper.find(markerSingle) != std::string::npos) {
        const std::size_t pos = upper.find(markerSingle);
        std::string seq = trim(normalized.substr(0, pos));
        seq = NormalizeDashes(seq);
        _copPattern.special = AcopCopPattern::SpecialType::InSingleFdpSequence;
        _copPattern.singleFdpSequence = SplitDashOutsideParen(seq);
        for (auto& t : _copPattern.singleFdpSequence) {
            t = NormalizeUpper(t);
        }
        return;
    }

    if (upper.find(markerFlight) != std::string::npos) {
        std::string head = normalized;
        const std::size_t pos = upper.find(markerFlight);
        head = trim(head.substr(0, pos));
        head = NormalizeDashes(head);
        const auto tokens = SplitDashOutsideParen(head);
        if (tokens.size() == 2) {
            _copPattern.special = AcopCopPattern::SpecialType::DutyHasOperatingSectorAndEndsAfter;
            _copPattern.operatingDep = NormalizeUpper(tokens[0]);
            _copPattern.operatingArr = NormalizeUpper(tokens[1]);
            return;
        }
    }

    _copPattern.special = AcopCopPattern::SpecialType::None;
    const auto chainTokens = SplitDashOutsideParen(normalized);
    for (const auto& tokenRaw : chainTokens) {
        const std::string rawUpper = NormalizeUpper(tokenRaw);
        _copPattern.stationChainRawUpper.push_back(rawUpper);

        // Pattern wildcards (pattern-level):
        //   - "**" : match any number (including 0) of stations (regex-like ".*")
        //   - "?"  : match exactly one station (regex-like ".")
        // These are not location tokens; parse them as LocationExpr::Any and let the matcher interpret multiplicity.
        if (rawUpper == "**" || rawUpper == "?") {
            _copPattern.stationChain.emplace_back(AcopLocationExpr::Parse("*"));
        } else {
            _copPattern.stationChain.emplace_back(AcopLocationExpr::Parse(tokenRaw));
        }
    }
}

void AcopSlipPatternRuleParam::ParseSlipStation(const std::string& value) {
    _slipStationRaw = value;
    _slipStation = AcopLocationExpr{};
    _slipStationMatchMode = AcopSlipStationMatchMode::CityAnchor;
    _slipOccurrence = 0;

    std::string normalized = NormalizeDashes(trim(value));
    if (normalized.empty() || normalized == "*") {
        return;
    }

    // Support "TYO 1", "REUR 2"
    std::string stationPart = normalized;
    int occurrence = 0;
    {
        std::size_t pos = stationPart.find_last_of(' ');
        if (pos != std::string::npos) {
            const std::string suffix = trim(stationPart.substr(pos + 1));
            if (!suffix.empty() &&
                std::all_of(suffix.begin(), suffix.end(), [](unsigned char c) { return std::isdigit(c); })) {
                occurrence = atoi(suffix.c_str());
                stationPart = trim(stationPart.substr(0, pos));
            }
        }
    }

    _slipOccurrence = occurrence > 0 ? occurrence : 0;
    const std::string stationPartUpper = strToUpper(trim(stationPart));
    if (stationPartUpper == "*" || stationPartUpper.empty()) {
        _slipStationMatchMode = AcopSlipStationMatchMode::CityAnchor;
        return;
    }
    if (stationPartUpper == "%") {
        _slipStationMatchMode = AcopSlipStationMatchMode::AirportAnchor;
        return;
    }

    _slipStationMatchMode = AcopSlipStationMatchMode::Expression;
    _slipStation = AcopLocationExpr::Parse(stationPart);
}

void AcopSlipPatternRuleParam::ParseGroup(const std::string& value) {
    const std::string trimmed = trim(value);
    if (trimmed.empty() || trimmed == "*" || trimmed == RuleParamConstant::IGNORED) {
        _group = "DEFAULT";
        return;
    }
    _group = strToUpper(trimmed);
}

void AcopSlipPatternRuleParam::ParsePriority(const std::string& value) {
    _priority = ParseIntOrDefault(value, 0);
}

std::vector<std::string> AcopSlipPatternRuleParam::SplitPipeList(const std::string& value) {
    std::vector<std::string> tokens;
    std::vector<std::string> parts;
    split(value.c_str(), '|', parts);
    for (auto& p : parts) {
        std::string t = NormalizeUpper(p);
        if (!t.empty()) {
            tokens.push_back(t);
        }
    }
    return tokens;
}

void AcopSlipPatternRuleParam::ParseDutyBefore(const std::string& value) {
    _dutyBeforeRaw = value;
    const std::string trimmedValue = trim(value);
    if (isAllToken(trimmedValue)) {
        _dutyBefore.clear();
        return;
    }
    _dutyBefore = SplitPipeList(trimmedValue);
}

void AcopSlipPatternRuleParam::ParseDutyAfter(const std::string& value) {
    _dutyAfterRaw = value;
    const std::string trimmedValue = trim(value);
    if (isAllToken(trimmedValue)) {
        _dutyAfter.clear();
        return;
    }
    _dutyAfter = SplitPipeList(trimmedValue);
}

namespace {

AcopSlipOperatingRequirement parseOperatingRequirement(const std::string& value) {
    const std::string v = strToUpper(trim(value));
    if (v.empty() || v == "*" || v == RuleParamConstant::ALL ||
        v == RuleParamConstant::IGNORED ||
        v == "ANY") {
        return AcopSlipOperatingRequirement::Any;
    }
    if (v == "Y" || v == "YES" || v == "TRUE" || v == "1" ||
        v == "OPERATE" || v == "OPERATING") {
        return AcopSlipOperatingRequirement::Operate;
    }
    if (v == "N" || v == "NO" || v == "FALSE" || v == "0" ||
        v == "NONOPERATE" || v == "NON_OPERATE" || v == "NON-OPERATE" ||
        v == "NONOPERATING" || v == "NON_OPERATING" || v == "NON-OPERATING") {
        return AcopSlipOperatingRequirement::NonOperate;
    }
    // Unknown token: keep it permissive.
    return AcopSlipOperatingRequirement::Any;
}

}  // namespace

void AcopSlipPatternRuleParam::ParseSlipArrIsOperating(const std::string& value) {
    _slipArrIsOperatingRequirement = parseOperatingRequirement(value);
}

void AcopSlipPatternRuleParam::ParseSlipDepIsOperating(const std::string& value) {
    _slipDepIsOperatingRequirement = parseOperatingRequirement(value);
}

void AcopSlipPatternRuleParam::ParseSlipArrFlightNo(const std::string& value) {
    ParseSlipFlightNoValue(value, _slipArrFlightNoRaw, _slipArrFlightNoTokens, "arrival");
}

void AcopSlipPatternRuleParam::ParseSlipDepFlightNo(const std::string& value) {
    ParseSlipFlightNoValue(value, _slipDepFlightNoRaw, _slipDepFlightNoTokens, "departure");
}

void AcopSlipPatternRuleParam::ParseSlipFlightNoValue(const std::string& value,
                                                      std::string& rawValue,
                                                      std::vector<SlipFlightNoToken>& tokens,
                                                      const char* boundaryLabel) {
    rawValue = trim(value);
    tokens.clear();

    if (isAllToken(rawValue)) {
        return;
    }

    std::vector<std::string> pipeParts;
    split(rawValue.c_str(), '|', pipeParts);
    for (const auto& pipePart : pipeParts) {
        std::vector<std::string> slashParts;
        split(pipePart.c_str(), '/', slashParts);

        for (const auto& part : slashParts) {
            const std::string token = NormalizeUpper(part);
            if (token.empty()) {
                continue;
            }

            SlipFlightNoToken parsed;
            bool valid = false;

            if (token.size() >= 3 &&
                std::isalpha(static_cast<unsigned char>(token[0])) &&
                std::isalpha(static_cast<unsigned char>(token[1]))) {
                parsed.hasAirline = true;
                parsed.airlineUpper = token.substr(0, 2);
                parsed.flightNumberUpper = trim(token.substr(2));
                valid = !parsed.flightNumberUpper.empty();
            } else {
                bool hasAlpha = false;
                for (char c : token) {
                    if (std::isalpha(static_cast<unsigned char>(c))) {
                        hasAlpha = true;
                        break;
                    }
                }

                if (!hasAlpha) {
                    parsed.hasAirline = false;
                    parsed.flightNumberUpper = token;
                    valid = !parsed.flightNumberUpper.empty();
                }
            }

            if (!valid) {
                Logger::getRuleLogger()->warn("Rule 7421 slip {} flight token ignored (unrecognized token): {}",
                                              boundaryLabel,
                                              part);
                continue;
            }

            tokens.push_back(parsed);
        }
    }
}

void AcopSlipPatternRuleParam::ParseReportTimeWindow(const std::string& value) {
    _reportTimeRaw = value;
    _reportTimeWindow = ReportTimeWindow{};

    std::string normalized = NormalizeDashes(trim(value));
    if (isAllToken(normalized)) {
        _reportTimeWindow.allowAny = true;
        return;
    }
    normalized = NormalizeDashes(normalized);
    const auto dashPos = normalized.find('-');
    if (dashPos == std::string::npos) {
        _reportTimeWindow.allowAny = true;
        return;
    }

    const std::string startStr = trim(normalized.substr(0, dashPos));
    const std::string endStr = trim(normalized.substr(dashPos + 1));
    int startMin = ParseTimeMinutes(startStr);
    int endMin = ParseTimeMinutes(endStr);

    // Allow "24:00" to represent midnight at end of day.
    if (startMin == kMinutesInDay) {
        startMin = 0;
    }
    if (endMin == kMinutesInDay) {
        endMin = 0;
    }
    if (startMin < 0 || endMin < 0 || startMin >= kMinutesInDay || endMin >= kMinutesInDay) {
        _reportTimeWindow.allowAny = true;
        return;
    }

    _reportTimeWindow.allowAny = false;
    _reportTimeWindow.startMinutes = startMin;
    _reportTimeWindow.endMinutes = endMin;
}

void AcopSlipPatternRuleParam::ParseDepartureTimeAtBaseWindow(const std::string& value) {
    _departureTimeAtBaseRaw = value;
    _departureTimeAtBaseWindow = ReportTimeWindow{};

    std::string normalized = NormalizeDashes(trim(value));
    if (isAllToken(normalized)) {
        _departureTimeAtBaseWindow.allowAny = true;
        return;
    }
    normalized = NormalizeDashes(normalized);
    const auto dashPos = normalized.find('-');
    if (dashPos == std::string::npos) {
        _departureTimeAtBaseWindow.allowAny = true;
        return;
    }

    const std::string startStr = trim(normalized.substr(0, dashPos));
    const std::string endStr = trim(normalized.substr(dashPos + 1));
    int startMin = ParseTimeMinutes(startStr);
    int endMin = ParseTimeMinutes(endStr);

    // Allow "24:00" to represent midnight at end of day.
    if (startMin == kMinutesInDay) {
        startMin = 0;
    }
    if (endMin == kMinutesInDay) {
        endMin = 0;
    }
    if (startMin < 0 || endMin < 0 || startMin >= kMinutesInDay || endMin >= kMinutesInDay) {
        _departureTimeAtBaseWindow.allowAny = true;
        return;
    }

    _departureTimeAtBaseWindow.allowAny = false;
    _departureTimeAtBaseWindow.startMinutes = startMin;
    _departureTimeAtBaseWindow.endMinutes = endMin;
}

void AcopSlipPatternRuleParam::ParsePrevSlipLocalNights(const std::string& value) {
    // New design: numeric is threshold (>=). '*' is same as 0.
    _prevSlipLocalNightsThreshold = ParseIntOrDefault(value, 0);
    if (_prevSlipLocalNightsThreshold < 0) {
        _prevSlipLocalNightsThreshold = 0;
    }
}

void AcopSlipPatternRuleParam::ParsePrevSlipHadStandby(const std::string& value) {
    const std::string trimmedValue = trim(value);
    if (isAllToken(trimmedValue)) {
        _prevSlipHadStandbyFilter = -1;
        return;
    }
    const int parsed = atoi(trimmedValue.c_str());
    if (parsed == 0) {
        _prevSlipHadStandbyFilter = 0;
    } else if (parsed == 1) {
        _prevSlipHadStandbyFilter = 1;
    } else {
        _prevSlipHadStandbyFilter = -1;
    }
}

void AcopSlipPatternRuleParam::ParseMinSlipHours(const std::string& value) {
    _minSlipMinutes = ParseDurationMinutesOrUnconstrained(value, -1);
    if (_minSlipMinutes < 0) {
        _minSlipMinutes = -1;
    }
}

void AcopSlipPatternRuleParam::ParseMaxSlipHours(const std::string& value) {
    _maxSlipMinutes = ParseDurationMinutesOrUnconstrained(value, -1);
    if (_maxSlipMinutes < 0) {
        _maxSlipMinutes = -1;
    }
}

void AcopSlipPatternRuleParam::ParseMinSlipLocalNights(const std::string& value) {
    _minSlipLocalNights = ParseIntOrDefault(value, 0);
    if (_minSlipLocalNights < 0) {
        _minSlipLocalNights = 0;
    }
}

void AcopSlipPatternRuleParam::ParseSlipDepartDutyReportTime(const std::string& value) {
    _slipDepartDutyReportTimeRaw = trim(value);
    const std::string trimmedValue = trim(value);
    if (isAllToken(trimmedValue)) {
        _slipDepartDutyReportTimeMinutes = -1;
        return;
    }

    int minutes = ParseTimeMinutes(trimmedValue);
    if (minutes == kMinutesInDay) {
        minutes = 0;
    }
    if (minutes < 0 || minutes >= kMinutesInDay) {
        _slipDepartDutyReportTimeMinutes = -1;
        return;
    }
    _slipDepartDutyReportTimeMinutes = minutes;
}

void AcopSlipPatternRuleParam::ParseDutyAfterHours(const std::string& value) {
    _dutyAfterMinutes = ParseDurationMinutesOrUnconstrained(value, -1);
    if (_dutyAfterMinutes < 0) {
        _dutyAfterMinutes = -1;
    }
}

void AcopSlipPatternRuleParam::ParseDutyAfterLocalNights(const std::string& value) {
    _dutyAfterLocalNights = ParseIntOrUnconstrained(value, -1);
    if (_dutyAfterLocalNights < 0) {
        _dutyAfterLocalNights = -1;
    }
}

void AcopSlipPatternRuleParam::ParseDutyAfterLocalTime(const std::string& value) {
    const std::string trimmedValue = trim(value);
    if (isAllToken(trimmedValue)) {
        _dutyAfterLocalTimeMinutes = -1;
        return;
    }
    const int minutes = ParseTimeMinutes(trimmedValue);
    if (minutes < 0 || minutes >= kMinutesInDay) {
        _dutyAfterLocalTimeMinutes = -1;
        return;
    }
    _dutyAfterLocalTimeMinutes = minutes;
}

void AcopSlipPatternRuleParam::ParseMaxStandbyPeriods(const std::string& value) {
    const std::string upper = strToUpper(trim(value));
    if (upper == "N" || upper == "NO" || upper == "FALSE") {
        _maxStandbyPeriods = 0;
        return;
    }

    _maxStandbyPeriods = ParseIntOrUnconstrained(value, -1);
    if (_maxStandbyPeriods < 0) {
        _maxStandbyPeriods = -1;
    }
}

void AcopSlipPatternRuleParam::ParseMaxStandbyHours(const std::string& value) {
    const std::string upper = strToUpper(trim(value));
    if (upper == "N" || upper == "NO" || upper == "FALSE") {
        _maxStandbyMinutes = 0;
        return;
    }

    _maxStandbyMinutes = ParseDurationMinutesOrUnconstrained(value, -1);
    if (_maxStandbyMinutes < 0) {
        _maxStandbyMinutes = -1;
    }
}

void AcopSlipPatternRuleParam::ParseAllowedDutyWithinSlip(const std::string& value) {
    _allowedDutyWithinSlipRaw = trim(value);
    _allowedDutyWithinSlip = AcopAllowedDutyWithinSlip{};

    if (_allowedDutyWithinSlipRaw.empty()) {
        _allowedDutyWithinSlipRaw = "*";
        return;
    }

    if (isAllToken(_allowedDutyWithinSlipRaw)) {
        return;
    }

    {
        const std::string upper = strToUpper(_allowedDutyWithinSlipRaw);
        if (upper == "NONE" || upper == "NO") {
            _allowedDutyWithinSlip.disallowAll = true;
            return;
        }
    }

    const std::vector<std::string> clausesUpper = splitAllowedDutyClausesUpper(_allowedDutyWithinSlipRaw);
    for (const auto& clauseUpper : clausesUpper) {
        if (clauseUpper.empty() || clauseUpper == "*") {
            continue;
        }

        if (clauseUpper == "NONE" || clauseUpper == "NO") {
            _allowedDutyWithinSlip.disallowAll = true;
            _allowedDutyWithinSlip.anyOf.clear();
            return;
        }

        if (clauseUpper.rfind("POS", 0) == 0) {
            std::string rest = trim(clauseUpper.substr(std::string("POS").size()));

            int maxDurationMinutes = 0;
            if (!rest.empty() && (rest.rfind("<=", 0) == 0 || rest.rfind(std::string(u8"\u2264"), 0) == 0)) {
                std::size_t consumed = 0;
                int parsed = 0;
                if (parseLeadingDurationMinutes(rest, &parsed, &consumed)) {
                    maxDurationMinutes = parsed;
                    rest = trim(rest.substr(consumed));
                }
            }

            AcopLocationExpr loc{};
            if (rest.rfind("IN", 0) == 0) {
                const std::string locationRaw = trim(rest.substr(std::string("IN").size()));
                loc = AcopLocationExpr::Parse(locationRaw);
            }

            if (loc.type == AcopLocationExpr::Type::Any && maxDurationMinutes <= 0) {
                AcopAllowedDutyWithinSlipConstraint c;
                c.type = AcopAllowedDutyWithinSlipConstraint::Type::Pos;
                _allowedDutyWithinSlip.anyOf.push_back(std::move(c));
                continue;
            }

            AcopAllowedDutyWithinSlipConstraint c;
            c.type = AcopAllowedDutyWithinSlipConstraint::Type::PosInLocation;
            c.location = loc;
            c.maxDurationMinutes = maxDurationMinutes;
            _allowedDutyWithinSlip.anyOf.push_back(std::move(c));
            continue;
        }

        if (clauseUpper.rfind("FDP", 0) == 0) {
            std::string rest = trim(clauseUpper.substr(std::string("FDP").size()));

            int maxDurationMinutes = 0;
            bool hasExplicitDuration = false;
            if (!rest.empty() && (rest.rfind("<=", 0) == 0 || rest.rfind(std::string(u8"\u2264"), 0) == 0)) {
                std::size_t consumed = 0;
                int parsed = 0;
                if (parseLeadingDurationMinutes(rest, &parsed, &consumed)) {
                    maxDurationMinutes = parsed;
                    hasExplicitDuration = true;
                    rest = trim(rest.substr(consumed));
                }
            }

            // Backward-compatible: "FDP" (with no IN/number) means default <=6h; "FDP IN <loc>" means unconstrained duration.
            const bool hasInToken = (rest.rfind("IN", 0) == 0) || (rest.find(" IN ") != std::string::npos);
            if (!hasExplicitDuration && !hasInToken) {
                const int defaultHours = 6;
                const int hours = parseFirstPositiveInt(clauseUpper, defaultHours);
                maxDurationMinutes = hours > 0 ? hours * 60 : defaultHours * 60;
            }

            AcopLocationExpr loc{};
            if (rest.rfind("IN", 0) == 0) {
                const std::string locationRaw = trim(rest.substr(std::string("IN").size()));
                loc = AcopLocationExpr::Parse(locationRaw);
            } else if (rest.find(" IN ") != std::string::npos) {
                const std::size_t posIn = rest.find(" IN ");
                const std::string locationRaw = trim(rest.substr(posIn + std::string(" IN ").size()));
                loc = AcopLocationExpr::Parse(locationRaw);
            }

            AcopAllowedDutyWithinSlipConstraint c;
            c.type = AcopAllowedDutyWithinSlipConstraint::Type::FdpMaxDuration;
            c.maxDurationMinutes = maxDurationMinutes;
            c.location = loc;
            _allowedDutyWithinSlip.anyOf.push_back(std::move(c));
            continue;
        }

        if (clauseUpper.find("DUTY IN") == 0) {
            const std::string rhs = trim(clauseUpper.substr(std::string("DUTY IN").size()));
            if (!rhs.empty() && rhs[0] == '(') {
                AcopAllowedDutyWithinSlipConstraint c;
                c.type = AcopAllowedDutyWithinSlipConstraint::Type::DutyInPaths;
                c.allowedPaths = parseDutyInPaths(clauseUpper);
                if (!c.allowedPaths.empty()) {
                    _allowedDutyWithinSlip.anyOf.push_back(std::move(c));
                } else {
                    Logger::getRuleLogger()->warn("Rule 7421 allowed duty within slip ignored (empty paths): {}", _allowedDutyWithinSlipRaw);
                }
            } else {
                const AcopLocationExpr loc = AcopLocationExpr::Parse(rhs);
                if (loc.type == AcopLocationExpr::Type::Any) {
                    Logger::getRuleLogger()->warn("Rule 7421 allowed duty within slip ignored (DUTY IN *): {}", _allowedDutyWithinSlipRaw);
                } else {
                    AcopAllowedDutyWithinSlipConstraint c;
                    c.type = AcopAllowedDutyWithinSlipConstraint::Type::DutyInLocation;
                    c.location = loc;
                    _allowedDutyWithinSlip.anyOf.push_back(std::move(c));
                }
            }
            continue;
        }

        Logger::getRuleLogger()->warn("Rule 7421 allowed duty within slip ignored (unrecognized token): {}", clauseUpper);
    }
}

void AcopSlipPatternRuleParam::ParseDoAfterDuty(const std::string& value) {
    _doAfterDutyRaw = trim(value);
    _doAfterDutyDays = 0;
    _doAfterDutyAfterAssignmentsUpper.clear();

    if (isAllToken(_doAfterDutyRaw)) {
        return;
    }

    const std::string upper = strToUpper(_doAfterDutyRaw);
    const std::string marker = "AFTER";
    const std::size_t pos = upper.find(marker);
    if (pos == std::string::npos) {
        _doAfterDutyDays = ParseIntOrDefault(_doAfterDutyRaw, 0);
        if (_doAfterDutyDays < 0) {
            _doAfterDutyDays = 0;
        }
        return;
    }

    const std::string left = trim(upper.substr(0, pos));
    const std::string right = trim(upper.substr(pos + marker.size()));

    _doAfterDutyDays = ParseIntOrDefault(left, 0);
    if (_doAfterDutyDays < 0) {
        _doAfterDutyDays = 0;
    }

    if (right.empty() || right == "*") {
        return;
    }

    _doAfterDutyAfterAssignmentsUpper = SplitPipeList(right);
}

void AcopSlipPatternRuleParam::ParseExtraCondition(const std::string& value) {
    _extraConditionRaw = trim(value);
    _extraConditionType = AcopSlipPatternExtraConditionType::None;
    _doAfterTriggerType = AcopDoAfterTriggerType::Always;
    _doAfterTriggerRaw.clear();
    _atdoDaysOffAtBase = 0;
    _exdoDaysOffAtBase = 0;
    if (_extraConditionRaw.empty()) {
        _extraConditionRaw = "*";
        return;
    }
    if (isAllToken(_extraConditionRaw)) {
        _extraConditionRaw = "*";
        return;
    }

    const std::string upper = strToUpper(_extraConditionRaw);
    const std::vector<std::string> tokens = SplitSemicolonList(upper);
    for (const auto& tokenRaw : tokens) {
        const std::string token = trim(tokenRaw);
        if (token.empty()) {
            continue;
        }
        if (token == "EUR_4B" || token == "EUR4B" || token == "EUROPE_4B") {
            _extraConditionType = AcopSlipPatternExtraConditionType::Eur4B;
            continue;
        }
        if (token == "9AI_STBY" || token == "9A_I_STBY" || token == "9AI_STANDBY") {
            if (_extraConditionType == AcopSlipPatternExtraConditionType::None) {
                _extraConditionType = AcopSlipPatternExtraConditionType::NineAiStandbyCrew;
            } else if (_extraConditionType != AcopSlipPatternExtraConditionType::NineAiStandbyCrew) {
                Logger::getRuleLogger()->warn("Rule 7421 extra condition ignored (conflicting token): {}", token);
            }
            continue;
        }
        if (token.rfind("DO_AFTER_TRIGGER=", 0) == 0) {
            const std::string rhs = trim(token.substr(17));
            AcopDoAfterTriggerType parsedType = AcopDoAfterTriggerType::Always;
            if (rhs == "DAY_AFTER_ARRIVAL") {
                parsedType = AcopDoAfterTriggerType::DayAfterArrival;
            } else if (rhs == "REST_LT_24H" || rhs == "REST<24H" || rhs == "REST_LT24H") {
                parsedType = AcopDoAfterTriggerType::RestLt24H;
            } else {
                Logger::getRuleLogger()->warn("Rule 7421 extra condition ignored (unrecognized DO after trigger): {}", rhs);
                continue;
            }
            if (_doAfterTriggerType == AcopDoAfterTriggerType::Always || _doAfterTriggerType == parsedType) {
                _doAfterTriggerType = parsedType;
                _doAfterTriggerRaw = rhs;
            } else {
                Logger::getRuleLogger()->warn("Rule 7421 extra condition ignored (conflicting DO after trigger): {}", rhs);
            }
            continue;
        }
        if (token.rfind("ATDO=", 0) == 0) {
            const std::string rhs = trim(token.substr(5));
            const int parsed = ParseIntOrDefault(rhs, 0);
            if (parsed > 0) {
                _atdoDaysOffAtBase = std::max(_atdoDaysOffAtBase, parsed);
            }
            continue;
        }
        if (token.rfind("EXDO=", 0) == 0) {
            const std::string rhs = trim(token.substr(5));
            const int parsed = ParseIntOrDefault(rhs, 0);
            if (parsed > 0) {
                _exdoDaysOffAtBase = std::max(_exdoDaysOffAtBase, parsed);
            }
            continue;
        }

        Logger::getRuleLogger()->warn("Rule 7421 extra condition ignored (unrecognized token): {}", token);
    }
}

std::vector<std::string> AcopSlipPatternRuleParam::SplitSemicolonList(const std::string& value) {
    std::vector<std::string> parts;
    std::string current;
    for (char c : value) {
        if (c == ';') {
            parts.push_back(trim(current));
            current.clear();
            continue;
        }
        current.push_back(c);
    }
    parts.push_back(trim(current));
    parts.erase(std::remove_if(parts.begin(), parts.end(), [](const std::string& s) { return s.empty(); }), parts.end());
    return parts;
}

std::vector<std::string> AcopSlipPatternRuleParam::SplitDashOutsideParen(const std::string& value) {
    std::vector<std::string> parts;
    std::string normalized = NormalizeDashes(value);
    int depth = 0;
    std::string current;
    for (char c : normalized) {
        if (c == '(') {
            ++depth;
            current.push_back(c);
        } else if (c == ')') {
            if (depth > 0) {
                --depth;
            }
            current.push_back(c);
        } else if (c == '-' && depth == 0) {
            parts.push_back(trim(current));
            current.clear();
        } else {
            current.push_back(c);
        }
    }
    parts.push_back(trim(current));
    parts.erase(std::remove_if(parts.begin(), parts.end(), [](const std::string& s) { return s.empty(); }), parts.end());
    return parts;
}
