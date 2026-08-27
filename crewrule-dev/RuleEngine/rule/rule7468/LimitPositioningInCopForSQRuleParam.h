/**
 * @file LimitPositioningInCopForSQRuleParam.h
 * @brief
 * @author
 * @version 1.0
 * @date 2026-01-11
**/

#ifndef _LIMITPOSITIONINGINCOPFORSQRULEPARAM_H_
#define _LIMITPOSITIONINGINCOPFORSQRULEPARAM_H_

#include <algorithm>
#include <string>
#include <vector>

#include "CrewDB.h"
#include "Log/Logger.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"
#include "UtilFunc.h"

class LimitPositioningInCopForSQRule;

class LimitPositioningInCopForSQRuleParam : public RuleParam {
    friend class LimitPositioningInCopForSQRule;
public:
    explicit LimitPositioningInCopForSQRuleParam(const Rule* rule) : RuleParam(rule) {}

    constexpr static unsigned int RuleFuncId = 7468;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

    enum class ParamLocation {
        BASES = 0,
        SERVICE_TYPE = 1,
        FLEET_GROUP = 2,
        LIMIT_SECTOR_ASSIGNMENTS = 3,
        MAX_LIMITED_SECTORS_IN_COP = 4,
        LIMIT_DUTY_ASSIGNMENTS = 5,
        MAX_LIMITED_DUTIES_IN_COP = 6
    };

    void ParseParam(const std::string& paramString);
    void ParseParam(const DBRule& dbRule);

    bool MatchBase(const std::string& base) const;
    bool MatchOperatingScope(const std::vector<Duty*>& duties, CrewDataContext* dbData) const;
    bool MatchSectorAssignment(const Segment* segment) const;
    bool MatchDutyAssignment(const Duty* duty) const;
    std::string GetSectorAssignmentDescription() const;
    std::string GetDutyAssignmentDescription() const;

private:
    std::vector<std::string> _bases{};
    std::vector<std::string> _serviceTypes{};
    std::vector<std::string> _fleetGroups{};
    std::vector<std::string> _sectorAssignments{};
    std::vector<std::string> _sectorAssignmentExcludes{};
    bool _sectorAssignmentsMatchAll{false};
    std::vector<std::string> _dutyAssignments{};
    std::vector<std::string> _dutyAssignmentExcludes{};
    bool _dutyAssignmentsMatchAll{false};
    int _maxLimitedSectors{-1};
    int _maxLimitedDuties{-1};

    static std::vector<std::string> ParseServiceTypes(const std::string& value);
};

inline std::string LimitPositioningInCopForSQRuleParamNormalizeToken(const std::string& value) {
    return strToUpper(trim(value));
}

inline std::string LimitPositioningInCopForSQRuleParamGetSegmentServiceType(const Segment* segment) {

    return segment->getServiceType();
}

inline std::string LimitPositioningInCopForSQRuleParamGetDutyServiceType(const Duty* duty) {

    std::string firstKnownServiceType;
    for (const auto* segment : duty->getSegmentsRead()) {
        if (segment == nullptr) {
            continue;
        }

        const std::string segmentServiceType = LimitPositioningInCopForSQRuleParamGetSegmentServiceType(segment);
        if (firstKnownServiceType.empty() && !segmentServiceType.empty()) {
            firstKnownServiceType = segmentServiceType;
        }
        if (segment->getIsOperating() && segmentServiceType == "F") {
            return "F";
        }
    }

    return firstKnownServiceType;
}

inline void LimitPositioningInCopForSQRuleParamParseListValue(const std::string& value, std::vector<std::string>& output) {
    output.clear();
    const std::string normalized = LimitPositioningInCopForSQRuleParamNormalizeToken(value);
    if (normalized.empty() || normalized == "*") {
        return;
    }
    std::vector<std::string> tokens;
    split(normalized.c_str(), '|', tokens);
    for (const auto& token : tokens) {
        const std::string cleaned = LimitPositioningInCopForSQRuleParamNormalizeToken(token);
        if (!cleaned.empty() && cleaned != "*") {
            output.push_back(cleaned);
        }
    }
}

inline std::string LimitPositioningInCopForSQRuleParamJoinTokens(const std::vector<std::string>& values, const char* delimiter) {
    std::string output;
    for (std::size_t i = 0; i < values.size(); ++i) {
        if (i > 0) {
            output += delimiter;
        }
        output += values[i];
    }
    return output;
}

inline std::string LimitPositioningInCopForSQRuleParamBuildAssignmentDescription(const std::vector<std::string>& includes,
                                                                                const std::vector<std::string>& excludes,
                                                                                bool matchAll) {
    if (matchAll || includes.empty()) {
        if (excludes.empty()) {
            return "any";
        }
        return "any except " + LimitPositioningInCopForSQRuleParamJoinTokens(excludes, "/");
    }

    std::string description = LimitPositioningInCopForSQRuleParamJoinTokens(includes, "/");
    if (!excludes.empty()) {
        description += " except ";
        description += LimitPositioningInCopForSQRuleParamJoinTokens(excludes, "/");
    }
    return description;
}

inline int LimitPositioningInCopForSQRuleParamParseLimitValue(const std::string& value) {
    const std::string normalized = LimitPositioningInCopForSQRuleParamNormalizeToken(value);
    if (normalized.empty() || normalized == "*") {
        return -1;
    }
    return std::atoi(normalized.c_str());
}

inline void LimitPositioningInCopForSQRuleParamParseAssignmentFilter(const std::string& value,
                                                                     std::vector<std::string>& includes,
                                                                     std::vector<std::string>& excludes,
                                                                     bool& matchAll) {
    includes.clear();
    excludes.clear();
    matchAll = false;

    const std::string normalized = LimitPositioningInCopForSQRuleParamNormalizeToken(value);
    if (normalized.empty() || normalized == "*") {
        matchAll = true;
        return;
    }

    std::string includePart = normalized;
    std::string excludePart;
    const std::size_t tildePos = normalized.find('~');
    if (tildePos != std::string::npos) {
        includePart = LimitPositioningInCopForSQRuleParamNormalizeToken(normalized.substr(0, tildePos));
        excludePart = LimitPositioningInCopForSQRuleParamNormalizeToken(normalized.substr(tildePos + 1));
    }

    if (includePart.empty() || includePart == "*") {
        matchAll = true;
    } else {
        std::vector<std::string> includeTokens;
        split(includePart.c_str(), '|', includeTokens);
        for (const auto& token : includeTokens) {
            const std::string cleaned = LimitPositioningInCopForSQRuleParamNormalizeToken(token);
            if (!cleaned.empty() && cleaned != "*") {
                includes.push_back(cleaned);
            }
        }
    }

    if (!excludePart.empty()) {
        std::vector<std::string> excludeTokens;
        split(excludePart.c_str(), '|', excludeTokens);
        for (const auto& token : excludeTokens) {
            const std::string cleaned = LimitPositioningInCopForSQRuleParamNormalizeToken(token);
            if (!cleaned.empty() && cleaned != "*") {
                excludes.push_back(cleaned);
            }
        }
    }
}

inline std::vector<std::string> LimitPositioningInCopForSQRuleParam::ParseServiceTypes(const std::string& value) {
    std::vector<std::string> output;
    const std::string normalized = LimitPositioningInCopForSQRuleParamNormalizeToken(value);
    if (normalized.empty() || normalized == "*") {
        return output;
    }

    std::vector<std::string> tokens;
    split(normalized.c_str(), '|', tokens);
    for (const auto& token : tokens) {
        const std::string t = LimitPositioningInCopForSQRuleParamNormalizeToken(token);
        if (t.empty() || t == "*") {
            output.clear();
            return output;
        }
        if (t == "F" || t == "FREIGHT" || t == "FREIGHTER" || t == "FREIGTER") {
            output.push_back("F");
        } else if (t == "J" || t == "PASSENGER" || t == "PAX") {
            output.push_back("J");
        } else {
            output.push_back(t);
        }
    }
    return output;
}

inline void LimitPositioningInCopForSQRuleParam::ParseParam(const std::string& paramString) {
    std::vector<std::string> tokens;
    split(paramString.c_str(), delimInParam, tokens);
    if (tokens.size() < totalNumParam) {
        Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, not enough parameters: {}", RuleFuncId, paramString);
        return;
    }

    LimitPositioningInCopForSQRuleParamParseListValue(tokens[enum_to_underlying(ParamLocation::BASES)], _bases);
    _serviceTypes = ParseServiceTypes(tokens[enum_to_underlying(ParamLocation::SERVICE_TYPE)]);
    LimitPositioningInCopForSQRuleParamParseListValue(tokens[enum_to_underlying(ParamLocation::FLEET_GROUP)], _fleetGroups);
    LimitPositioningInCopForSQRuleParamParseAssignmentFilter(tokens[enum_to_underlying(ParamLocation::LIMIT_SECTOR_ASSIGNMENTS)],
                                                             _sectorAssignments, _sectorAssignmentExcludes, _sectorAssignmentsMatchAll);
    _maxLimitedSectors = LimitPositioningInCopForSQRuleParamParseLimitValue(tokens[enum_to_underlying(ParamLocation::MAX_LIMITED_SECTORS_IN_COP)]);
    LimitPositioningInCopForSQRuleParamParseAssignmentFilter(tokens[enum_to_underlying(ParamLocation::LIMIT_DUTY_ASSIGNMENTS)],
                                                             _dutyAssignments, _dutyAssignmentExcludes, _dutyAssignmentsMatchAll);
    _maxLimitedDuties = LimitPositioningInCopForSQRuleParamParseLimitValue(tokens[enum_to_underlying(ParamLocation::MAX_LIMITED_DUTIES_IN_COP)]);
}

inline void LimitPositioningInCopForSQRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    std::map<std::string, std::string>& parameter = const_cast<DBRule&>(dbRule).params;
    for (auto iter = parameter.begin(); iter != parameter.end(); ++iter) {
        const std::string header = LimitPositioningInCopForSQRuleParamNormalizeToken(iter->first);
        const std::string value = iter->second;
        if (header == "BASES") {
            LimitPositioningInCopForSQRuleParamParseListValue(value, _bases);
        } else if (header == "SERVICE TYPE") {
            _serviceTypes = ParseServiceTypes(value);
        } else if (header == "FLEET GROUP") {
            LimitPositioningInCopForSQRuleParamParseListValue(value, _fleetGroups);
        } else if (header == "LIMIT SECTOR ASSIGNMENTS") {
            LimitPositioningInCopForSQRuleParamParseAssignmentFilter(value, _sectorAssignments, _sectorAssignmentExcludes, _sectorAssignmentsMatchAll);
        } else if (header == "MAX LIMITED SECTORS IN COP") {
            _maxLimitedSectors = LimitPositioningInCopForSQRuleParamParseLimitValue(value);
        } else if (header == "LIMIT DUTY ASSIGNMENTS") {
            LimitPositioningInCopForSQRuleParamParseAssignmentFilter(value, _dutyAssignments, _dutyAssignmentExcludes, _dutyAssignmentsMatchAll);
        } else if (header == "MAX LIMITED DUTIES IN COP") {
            _maxLimitedDuties = LimitPositioningInCopForSQRuleParamParseLimitValue(value);
        } else {
            Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}",
                                           dbRule.idRule, dbRule.idRuleParam, iter->first);
        }
    }
}

inline bool LimitPositioningInCopForSQRuleParam::MatchBase(const std::string& base) const {
    if (_bases.empty()) {
        return true;
    }
    return std::find(_bases.begin(), _bases.end(), base) != _bases.end();
}

inline bool LimitPositioningInCopForSQRuleParam::MatchOperatingScope(const std::vector<Duty*>& duties,
                                                                     CrewDataContext* dbData) const {
    if (_fleetGroups.empty()) {
        return true;
    }

    bool sawOperating = false;

    for (const auto* duty : duties) {
        if (duty == nullptr) {
            continue;
        }
        for (const auto* seg : duty->getSegmentsRead()) {
            if (seg == nullptr || !seg->getIsOperating()) {
                continue;
            }

            sawOperating = true;
            if (dbData == nullptr) {
                return false;
            }
            const auto it = dbData->fleetMap.find(seg->getFleetCD());
            if (it == dbData->fleetMap.end()) {
                return false;
            }
            if (std::find(_fleetGroups.begin(), _fleetGroups.end(), it->second.fleetGrp) == _fleetGroups.end()) {
                return false;
            }
        }
    }

    return sawOperating;
}

inline bool LimitPositioningInCopForSQRuleParam::MatchSectorAssignment(const Segment* segment) const {
    if (segment == nullptr) {
        return false;
    }
    if (!_serviceTypes.empty()) {
        const std::string segmentServiceType = LimitPositioningInCopForSQRuleParamGetSegmentServiceType(segment);
        if (std::find(_serviceTypes.begin(), _serviceTypes.end(), segmentServiceType) == _serviceTypes.end()) {
            return false;
        }
    }

    const std::string& assignment = segment->getAssignment();
    if (_sectorAssignmentsMatchAll || _sectorAssignments.empty()) {
        return std::find(_sectorAssignmentExcludes.begin(), _sectorAssignmentExcludes.end(), assignment) == _sectorAssignmentExcludes.end();
    }
    if (std::find(_sectorAssignments.begin(), _sectorAssignments.end(), assignment) == _sectorAssignments.end()) {
        return false;
    }
    return std::find(_sectorAssignmentExcludes.begin(), _sectorAssignmentExcludes.end(), assignment) == _sectorAssignmentExcludes.end();
}

inline bool LimitPositioningInCopForSQRuleParam::MatchDutyAssignment(const Duty* duty) const {
    if (duty == nullptr) {
        return false;
    }
    if (!_serviceTypes.empty()) {
        const std::string dutyServiceType = LimitPositioningInCopForSQRuleParamGetDutyServiceType(duty);
        if (std::find(_serviceTypes.begin(), _serviceTypes.end(), dutyServiceType) == _serviceTypes.end()) {
            return false;
        }
    }

    const std::string& assignment = duty->getAssignment();
    if (_dutyAssignmentsMatchAll || _dutyAssignments.empty()) {
        return std::find(_dutyAssignmentExcludes.begin(), _dutyAssignmentExcludes.end(), assignment) == _dutyAssignmentExcludes.end();
    }
    if (std::find(_dutyAssignments.begin(), _dutyAssignments.end(), assignment) == _dutyAssignments.end()) {
        return false;
    }
    return std::find(_dutyAssignmentExcludes.begin(), _dutyAssignmentExcludes.end(), assignment) == _dutyAssignmentExcludes.end();
}

inline std::string LimitPositioningInCopForSQRuleParam::GetSectorAssignmentDescription() const {
    return LimitPositioningInCopForSQRuleParamBuildAssignmentDescription(_sectorAssignments, _sectorAssignmentExcludes, _sectorAssignmentsMatchAll);
}

inline std::string LimitPositioningInCopForSQRuleParam::GetDutyAssignmentDescription() const {
    return LimitPositioningInCopForSQRuleParamBuildAssignmentDescription(_dutyAssignments, _dutyAssignmentExcludes, _dutyAssignmentsMatchAll);
}

#endif  // _LIMITPOSITIONINGINCOPFORSQRULEPARAM_H_
