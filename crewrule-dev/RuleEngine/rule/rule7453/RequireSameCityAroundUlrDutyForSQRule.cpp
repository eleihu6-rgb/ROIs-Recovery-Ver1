/**
 * @file RequireSameCityAroundUlrDutyForSQRule.cpp
 */

#include "RequireSameCityAroundUlrDutyForSQRule.h"

#include <algorithm>
#include <map>
#include <set>
#include <sstream>

#include "StringUtil.h"
#include "../utils/RosterUtils.h"
#include "../framework/utils/StringUtils.h"

namespace {

std::string BuildOccurrenceDetail(int dutySeq,
                                  const std::string& side,
                                  const std::string& airport,
                                  const std::string& city) {
    std::ostringstream oss;
    oss << "duty " << dutySeq << ' ' << side << " via " << airport << '(' << city << ')';
    return oss.str();
}

}  // namespace

void RequireSameCityAroundUlrDutyForSQRule::ParseParam(const InputType& input) {
    _params.clear();

    if (!input.dbRules.empty()) {
        for (const auto& dbRule : input.dbRules) {
            if (dbRule.tableNum > 1) {
                continue;
            }
            RequireSameCityAroundUlrDutyForSQRuleParam param(this);
            param.ParseParam(dbRule);
            if (!param.IsActive()) {
                continue;
            }
            _params.push_back(std::move(param));
        }
    } else {
        int rowNum = 1;
        for (const auto& paramString : input.ruleParamString) {
            RequireSameCityAroundUlrDutyForSQRuleParam param(this);
            param.ParseParam(paramString);
            param.SetRowNum(rowNum++);
            if (!param.IsActive()) {
                continue;
            }
            _params.push_back(std::move(param));
        }
    }

    std::sort(_params.begin(),
              _params.end(),
              [](const RequireSameCityAroundUlrDutyForSQRuleParam& lhs,
                 const RequireSameCityAroundUlrDutyForSQRuleParam& rhs) {
                  if (lhs.GetRowNum() != rhs.GetRowNum()) {
                      return lhs.GetRowNum() < rhs.GetRowNum();
                  }
                  return lhs.GetRuleParamId() < rhs.GetRuleParamId();
              });
}

bool RequireSameCityAroundUlrDutyForSQRule::CheckRule(const Pairing* pairing) const {
    if (pairing == nullptr || _params.empty()) {
        return true;
    }

    const auto* matchedParam = FindMatchedParam(pairing);
    if (matchedParam == nullptr) {
        return true;
    }

    const auto& duties = pairing->getDutyVec();
    std::vector<AdjacentCityOccurrence> occurrences;
    occurrences.reserve(duties.size() * 2);

    for (std::size_t i = 0; i < duties.size(); ++i) {
        const Duty* duty = duties[i];
        if (duty == nullptr || !duty->isULR()) {
            continue;
        }

        if (i > 0) {
            const Duty* prevDuty = duties[i - 1];
            const Segment* prevLastSegment = prevDuty == nullptr ? nullptr : prevDuty->getLastSegment();
            if (prevLastSegment != nullptr && !prevLastSegment->getArrStation().empty()) {
                occurrences.push_back(AdjacentCityOccurrence{
                    duty->getDutySeq(),
                    "pre",
                    prevLastSegment->getArrStation(),
                    ResolveAirportCityCode(_dbData.get(), prevLastSegment->getArrStation())});
            }
        }

        if (i + 1 < duties.size()) {
            const Duty* nextDuty = duties[i + 1];
            const Segment* nextFirstSegment = nextDuty == nullptr ? nullptr : nextDuty->getFirstSegment();
            if (nextFirstSegment != nullptr && !nextFirstSegment->getDepStation().empty()) {
                occurrences.push_back(AdjacentCityOccurrence{
                    duty->getDutySeq(),
                    "post",
                    nextFirstSegment->getDepStation(),
                    ResolveAirportCityCode(_dbData.get(), nextFirstSegment->getDepStation())});
            }
        }
    }

    std::set<std::string> distinctCities;
    for (const auto& occurrence : occurrences) {
        if (!occurrence.city.empty()) {
            distinctCities.insert(occurrence.city);
        }
    }

    if (distinctCities.size() <= 1) {
        return true;
    }

    if (IsPairingOptimizerModel()) {
        return false;
    }

    _ruleViolation.SetRuleParam(*matchedParam);
    ThrowViolation(pairing, *matchedParam, occurrences);
    return false;
}

bool RequireSameCityAroundUlrDutyForSQRule::CheckRule(const Duty* duty) const {
    (void)duty;
    return true;
}

const RequireSameCityAroundUlrDutyForSQRuleParam*
RequireSameCityAroundUlrDutyForSQRule::FindMatchedParam(const Pairing* pairing) const {
    if (pairing == nullptr) {
        return nullptr;
    }

    std::string base = pairing->getBase();
    if (base.empty() && !pairing->getDutyVec().empty() && pairing->getDutyVec().front() != nullptr) {
        base = pairing->getDutyVec().front()->getDepStationRead();
    }

    for (const auto& param : _params) {
        if (!param.MatchBase(base)) {
            continue;
        }
        if (!param.MatchFleetGroupsForPairing(pairing, _dbData.get())) {
            continue;
        }
        return &param;
    }
    return nullptr;
}

void RequireSameCityAroundUlrDutyForSQRule::ThrowViolation(
    const Pairing* pairing,
    const RequireSameCityAroundUlrDutyForSQRuleParam& param,
    const std::vector<AdjacentCityOccurrence>& occurrences) const {

    if (pairing == nullptr || occurrences.empty()) {
        return;
    }

    std::map<std::string, std::vector<std::string>> cityDetails;
    for (const auto& occurrence : occurrences) {
        cityDetails[occurrence.city].push_back(
            BuildOccurrenceDetail(occurrence.dutySeq, occurrence.side, occurrence.airport, occurrence.city));
    }

    std::ostringstream citySummary;
    bool firstCity = true;
    for (const auto& entry : cityDetails) {
        if (!firstCity) {
            citySummary << "; ";
        }
        firstCity = false;
        citySummary << entry.first << " [";
        for (std::size_t i = 0; i < entry.second.size(); ++i) {
            if (i > 0) {
                citySummary << ", ";
            }
            citySummary << entry.second[i];
        }
        citySummary << "]";
    }

    const std::string message = StringUtils::Format(
        "ULR adjacent-city mismatch in COP: non-boundary cities around ULR duties must match, but found {0:city_summary}.",
        citySummary.str());

    std::string base = pairing->getBase();
    if (base.empty() && !pairing->getDutyVec().empty() && pairing->getDutyVec().front() != nullptr) {
        base = pairing->getDutyVec().front()->getDepStationRead();
    }

    _ruleViolation.SetParam("base", base);
    _ruleViolation.SetParam("fleet_group", param.GetFleetGroupLabel());
    _ruleViolation.SetParam("conflict_cities", citySummary.str());

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->idRule = RequireSameCityAroundUlrDutyForSQRule::RuleFuncId;
    rv->ruleParamId = param.GetRuleParamId();
    rv->pairingId = pairing->getDutyVec().empty() || pairing->getDutyVec().front() == nullptr
                        ? -1
                        : pairing->getDutyVec().front()->getPairingId();
    rv->dutySequenceNumber = occurrences.front().dutySeq;
    rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
    rv->reference = "SQ";
    rv->description = "Pairing";
    rv->startDTUtc = pairing->getDutyVec().empty() || pairing->getDutyVec().front() == nullptr
                         ? 0
                         : pairing->getDutyVec().front()->getStartTimeUtcAct();
    rv->endDTUtc = pairing->getDutyVec().empty() || pairing->getDutyVec().back() == nullptr
                       ? 0
                       : pairing->getDutyVec().back()->getEndTimeUtcAct();
    rv->violation_msg = message;

    rv->operation_result.insert(std::make_pair("ruleId", StringUtils::lltos(rv->idRule)));
    rv->operation_result.insert(std::make_pair("ruleParamId", StringUtils::lltos(rv->ruleParamId)));
    rv->operation_result.insert(std::make_pair("base", base));
    rv->operation_result.insert(std::make_pair("fleet_group", param.GetFleetGroupLabel()));
    rv->operation_result.insert(std::make_pair("conflict_cities", citySummary.str()));

    if (_ruleViolation.GetRuleLegality() != nullptr && _dbData != nullptr) {
        auto* legality = _ruleViolation.GetRuleLegality();
        if (legality->crewIndex >= 0 && legality->crewIndex < static_cast<int>(_dbData->crewList.size())) {
            SharedPtr<CREW> crew = _dbData->crewList[legality->crewIndex];
            const SharedPtr<ROSTER> roster =
                RosterUtils::GetRosterByPairingId(crew->rosterList, rv->pairingId);
            rv->crewId = crew->idCrew;
            rv->rosterId = roster == nullptr ? -1 : roster->rosterId;
            _ruleViolation.SetLegalityMessage(crew, message);
        }
    } else if (!pairing->getDutyVec().empty() && pairing->getDutyVec().front() != nullptr) {
        _ruleViolation.SetLegalityMessage(pairing->getDutyVec().front(),
                                          message,
                                          RequireSameCityAroundUlrDutyForSQRule::RuleFuncId);
    }

    _ruleViolation.AddRuleViolations(rv);
}

std::string RequireSameCityAroundUlrDutyForSQRule::ResolveAirportCityCode(const CrewDataContext* dbData,
                                                                          const std::string& airport) {
    const std::string airportUpper = strToUpper(trim(airport));
    if (dbData == nullptr) {
        return airportUpper;
    }

    const auto iter = dbData->airportCodeMap.find(airportUpper);
    if (iter == dbData->airportCodeMap.end() || iter->second == nullptr || iter->second->city[0] == '\0') {
        return airportUpper;
    }
    return std::string(iter->second->city);
}
