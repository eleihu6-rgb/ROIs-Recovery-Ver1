/**
 * @file RestrictCoterminalDutyConnectionForSQRule.cpp
 */

#include "RestrictCoterminalDutyConnectionForSQRule.h"

#include <algorithm>
#include <sstream>

#include "../RuleSytem.h"
#include "../utils/RosterUtils.h"
#include "../utils/StringUtils.h"
#include "StringUtil.h"
#include "../constant/Constants.h"

namespace {
constexpr const char* kPrevArrParamName = "prev_duty_arrival";
constexpr const char* kPrevAssignParamName = "prev_duty_assignment";
constexpr const char* kNextDepParamName = "next_duty_depart";
constexpr const char* kNextAssignParamName = "next_duty_assignment";

bool HasActiveFlag(const DBRule& dbRule, bool& activeOut) {
    for (const auto& entry : dbRule.params) {
        const std::string headerUpper = strToUpper(trim(entry.first));
        if (headerUpper == "ACTIVE" || headerUpper == "ENABLED" || headerUpper == "IS ACTIVE") {
            activeOut = (strToUpper(trim(entry.second)) == RuleParamConstant::YES);
            return true;
        }
    }
    return false;
}

bool IsOperatingAssignment(const Segment* seg) {
    if (seg == nullptr) {
        return false;
    }
    return seg->getIsOperating();
}
}

bool RestrictCoterminalDutyConnectionForSQRule::CheckRule(const Pairing* pairing) const {
    if (!_isConfigured || pairing == nullptr) {
        return true;
    }

    bool passAll = true;
    const auto& duties = pairing->getDutyVec();
    for (const auto* duty : duties) {
        if (!CheckDutySegments(duty)) {
            passAll = false;
            if (!IsCheckAllRule()) {
                break;
            }
        }
    }
    if (!passAll && !IsCheckAllRule()) {
        return false;
    }
    if (!CheckDutyConnections(duties)) {
        passAll = false;
    }
    return passAll;
}

bool RestrictCoterminalDutyConnectionForSQRule::CheckRule(const Duty* duty) const {
    if (!_isConfigured || duty == nullptr) {
        return true;
    }
    return CheckDutySegments(duty);
}

bool RestrictCoterminalDutyConnectionForSQRule::CheckDutySegments(const Duty* duty) const {
    if (duty == nullptr) {
        return true;
    }
    bool pass = true;
    for (const auto* segment : duty->getSegmentsRead()) {
        if (segment == nullptr) {
            continue;
        }
        const std::string dep = segment->getDepStation();
        const std::string arr = segment->getArrStation();
        if (dep.empty() || arr.empty() || dep == arr) {
            continue;
        }
        if (!IsCoterminalAirportPair(dep, arr)) {
            continue;
        }
        if (IsOperatingAssignment(segment)) {
            continue;
        }
        ReportDeadheadBetweenCoterminalsViolation(duty, segment);
        pass = false;
        if (!IsCheckAllRule()) {
            break;
        }
    }
    return pass;
}

bool RestrictCoterminalDutyConnectionForSQRule::CheckDutyConnections(const std::vector<Duty*>& duties) const {
    if (duties.size() <= 1) {
        return true;
    }
    bool pass = true;
    for (std::size_t i = 0; i + 1 < duties.size(); ++i) {
        const Duty* prevDuty = duties[i];
        const Duty* nextDuty = duties[i + 1];
        if (prevDuty == nullptr || nextDuty == nullptr) {
            continue;
        }
        const Segment* prevLastSeg = prevDuty->getLastSegment();
        const Segment* nextFirstSeg = nextDuty->getFirstSegment();
        if (prevLastSeg == nullptr || nextFirstSeg == nullptr) {
            continue;
        }

        const std::string prevArr = prevLastSeg->getArrStation();
        const std::string nextDep = nextFirstSeg->getDepStation();
        if (prevArr.empty() || nextDep.empty() || prevArr == nextDep) {
            continue;
        }
        if (!IsCoterminalAirportPair(prevArr, nextDep)) {
            continue;
        }

        const std::string prevAssignment = prevLastSeg->getAssignment();
        const std::string nextAssignment = nextFirstSeg->getAssignment();

        for (const auto& param : _restrictedConnections) {
            _ruleViolation.SetRuleParam(param);
            if (!param.Matches(prevArr, prevAssignment, nextDep, nextAssignment)) {
                continue;
            }
            ReportRestrictedConnectionViolation(prevDuty, prevLastSeg, nextDuty, nextFirstSeg, param);
            pass = false;
            if (!IsCheckAllRule()) {
                return false;
            }
            break;
        }
    }
    return pass;
}

bool RestrictCoterminalDutyConnectionForSQRule::IsCoterminalAirportPair(const std::string& airportA,
                                                                        const std::string& airportB) const {
    if (airportA.empty() || airportB.empty()) {
        return false;
    }
    if (airportA == airportB) {
        return true;
    }
    const std::string cityA = GetAirportCityCode(airportA);
    const std::string cityB = GetAirportCityCode(airportB);
    if (cityA.empty() || cityB.empty()) {
        return false;
    }
    return cityA == cityB;
}

std::string RestrictCoterminalDutyConnectionForSQRule::GetAirportCityCode(const std::string& airport) const {
    if (!_dbData) {
        return "";
    }
    const auto it = _dbData->airportCodeMap.find(airport);
    if (it == _dbData->airportCodeMap.end() || it->second == nullptr) {
        return "";
    }
    return std::string(it->second->city);
}

void RestrictCoterminalDutyConnectionForSQRule::ReportRestrictedConnectionViolation(
    const Duty* prevDuty,
    const Segment* prevLastSeg,
    const Duty* nextDuty,
    const Segment* nextFirstSeg,
    const RestrictCoterminalDutyConnectionForSQRuleParam& param) const {

    const std::string prevArr = prevLastSeg == nullptr ? std::string() : prevLastSeg->getArrStation();
    const std::string nextDep = nextFirstSeg == nullptr ? std::string() : nextFirstSeg->getDepStation();
    const std::string prevAssign = prevLastSeg == nullptr ? std::string() : prevLastSeg->getAssignment();
    const std::string nextAssign = nextFirstSeg == nullptr ? std::string() : nextFirstSeg->getAssignment();

    const std::string msgTemplate =
        "[Operational] Restricted coterminal connection: prev duty arrives {0:prevArr} ({1:prevAssign}) and next duty departs {2:nextDep} ({3:nextAssign}).";
    const std::string msg = StringUtils::Format(msgTemplate, prevArr, prevAssign, nextDep, nextAssign);

    _ruleViolation.SetParam(kPrevArrParamName, prevArr);
    _ruleViolation.SetParam(kPrevAssignParamName, prevAssign);
    _ruleViolation.SetParam(kNextDepParamName, nextDep);
    _ruleViolation.SetParam(kNextAssignParamName, nextAssign);

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->idRule = RestrictCoterminalDutyConnectionForSQRule::RuleFuncId;
    rv->ruleParamId = param.GetRuleParamId();
    rv->pairingId = nextDuty == nullptr ? -1 : nextDuty->getPairingId();
    rv->dutySequenceNumber = nextDuty == nullptr ? -1 : nextDuty->getDutySeq();
    rv->segmentId = nextFirstSeg == nullptr ? -1 : nextFirstSeg->getSegmentId();
    rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
    rv->startDTUtc = nextDuty == nullptr ? 0 : nextDuty->getStartTimeUtcAct();
    rv->endDTUtc = nextDuty == nullptr ? 0 : nextDuty->getEndTimeUtcAct();
    rv->violation_msg = msg;

    rv->operation_result.insert(std::make_pair("ruleId", StringUtils::lltos(rv->idRule)));
    rv->operation_result.insert(std::make_pair("ruleParamId", StringUtils::lltos(rv->ruleParamId)));
    rv->operation_result.insert(std::make_pair("prevArr", prevArr));
    rv->operation_result.insert(std::make_pair("prevAssign", prevAssign));
    rv->operation_result.insert(std::make_pair("nextDep", nextDep));
    rv->operation_result.insert(std::make_pair("nextAssign", nextAssign));

    if (_ruleViolation.GetRuleLegality() != nullptr) {
        _ruleViolation.GetRuleLegality()->isLegal = false;
        _ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
        if (_dbData != nullptr) {
            const int crewIndex = _ruleViolation.GetRuleLegality()->crewIndex;
            if (crewIndex >= 0 && crewIndex < static_cast<int>(_dbData->crewList.size())) {
                SharedPtr<CREW> crew = _dbData->crewList[crewIndex];
                if (crew != nullptr) {
                    const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(crew->rosterList, rv->pairingId);
                    rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
                    rv->crewId = crew->idCrew;
                    _ruleViolation.SetLegalityMessage(crew, msg);
                }
            }
        }
    } else if (nextDuty != nullptr) {
        _ruleViolation.SetLegalityMessage(const_cast<Duty*>(nextDuty), msg, RestrictCoterminalDutyConnectionForSQRule::RuleFuncId);
    }

    _ruleViolation.AddRuleViolations(rv);
}

void RestrictCoterminalDutyConnectionForSQRule::ReportDeadheadBetweenCoterminalsViolation(const Duty* duty,
                                                                                          const Segment* segment) const {
    if (duty == nullptr || segment == nullptr) {
        return;
    }
    const std::string dep = segment->getDepStation();
    const std::string arr = segment->getArrStation();
    const std::string assignment = segment->getAssignment();

    std::string msgTemplate =
        "[Operational] Positioning/Deadheading on flight sector between coterminals is not allowed: {0:dep}-{1:arr} ({2:assignment}).";
    const std::string msg = StringUtils::Format(msgTemplate, dep, arr, assignment);

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->idRule = RestrictCoterminalDutyConnectionForSQRule::RuleFuncId;
    rv->pairingId = duty->getPairingId();
    rv->dutySequenceNumber = duty->getDutySeq();
    rv->segmentId = segment->getSegmentId();
    rv->type = VIOLATION_TYPE::FLIGHT_VIOLATION;
    rv->startDTUtc = duty->getStartTimeUtcAct();
    rv->endDTUtc = duty->getEndTimeUtcAct();
    rv->violation_msg = msg;

    rv->operation_result.insert(std::make_pair("ruleId", StringUtils::lltos(rv->idRule)));
    rv->operation_result.insert(std::make_pair("dep", dep));
    rv->operation_result.insert(std::make_pair("arr", arr));
    rv->operation_result.insert(std::make_pair("assignment", assignment));

    if (_ruleViolation.GetRuleLegality() != nullptr) {
        _ruleViolation.GetRuleLegality()->isLegal = false;
        _ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
        if (_dbData != nullptr) {
            const int crewIndex = _ruleViolation.GetRuleLegality()->crewIndex;
            if (crewIndex >= 0 && crewIndex < static_cast<int>(_dbData->crewList.size())) {
                SharedPtr<CREW> crew = _dbData->crewList[crewIndex];
                if (crew != nullptr) {
                    const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(crew->rosterList, duty->getPairingId());
                    rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
                    rv->crewId = crew->idCrew;
                    _ruleViolation.SetLegalityMessage(crew, msg);
                }
            }
        }
    } else {
        _ruleViolation.SetLegalityMessage(const_cast<Duty*>(duty), msg, RestrictCoterminalDutyConnectionForSQRule::RuleFuncId);
    }
    _ruleViolation.AddRuleViolations(rv);
}

bool RestrictCoterminalDutyConnectionForSQRule::IsActiveRow(const DBRule& dbRule) const {
    bool activeValue = true;
    if (!HasActiveFlag(dbRule, activeValue)) {
        return true;
    }
    return activeValue;
}

void RestrictCoterminalDutyConnectionForSQRule::ParseParam(const InputType& input) {
    _restrictedConnections.clear();
    _isConfigured = true;

    int rowNum = 1;
    for (const auto& dbRule : input.dbRules) {
        if (dbRule.tableNum > 1) {
            continue;
        }
        if (!IsActiveRow(dbRule)) {
            continue;
        }
        _restrictedConnections.emplace_back(this);
        _restrictedConnections.back().SetRowNum(dbRule.rowNum > 0 ? dbRule.rowNum : rowNum++);
        _restrictedConnections.back().ParseParam(dbRule);
    }
    if (_restrictedConnections.empty()) {
        for (const auto& paramString : input.ruleParamString) {
            _restrictedConnections.emplace_back(this);
            _restrictedConnections.back().SetRowNum(rowNum++);
            _restrictedConnections.back().ParseParam(paramString);
        }
    }

    std::sort(_restrictedConnections.begin(),
              _restrictedConnections.end(),
              [](const RestrictCoterminalDutyConnectionForSQRuleParam& lhs,
                 const RestrictCoterminalDutyConnectionForSQRuleParam& rhs) {
                  if (lhs.GetRowNum() != rhs.GetRowNum()) {
                      return lhs.GetRowNum() < rhs.GetRowNum();
                  }
                  return lhs.GetRuleParamId() < rhs.GetRuleParamId();
              });
}

