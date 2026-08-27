#include "SingleDailyCheckinForCARSRule.h"

#include <algorithm>

#include "Utility.h"
#include "UtilFunc.h"

#include "../RuleSytem.h"

namespace {

std::string GetRosterEndStation(const ROSTER* roster) {
    if (roster == nullptr)
        return {};
    if (roster->pairing != nullptr)
        return roster->pairing->getEndArp();
    return roster->location;
}

bool ShouldCheckPhase(long long phase, bool isPlanning) {
    return (phase == 1 && isPlanning) || (phase == 3 && !isPlanning) || (phase == 1 && !isPlanning);
}

}  // namespace

void SingleDailyCheckinForCARSRule::ParseParam(const InputType& input) {
    _ruleParams.clear();
    for (const auto& dbRule : input.dbRules) {
        _ruleParams.emplace_back(SingleDailyCheckinForCARSRuleParam(this));
        _ruleParams.back().ParseParam(dbRule);
    }
}

bool SingleDailyCheckinForCARSRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
    if (_ruleParams.empty() || rosters.empty()) {
        return true;
    }

    RULE_LEGALITY* ruleLegality = _ruleViolation.GetRuleLegality();
    if (ruleLegality == nullptr || ruleLegality->crewIndex < 0) {
        return true;
    }

    const auto& crew = _dbData->crewList[ruleLegality->crewIndex];
    const auto& rosterList = crew->rosterList;
    if (rosterList.empty())
        return true;

    time_t checkedStart = 0;
    time_t checkedEnd = 0;
    if (this->_application == ROSTER_OPTIMIZER) {
        checkedStart = this->_dbData->scenario.startDtUTC;
        checkedEnd = this->_dbData->scenario.endDtUTC + 24 * 3600;
    } else {
        checkedStart = rosterList[0]->actStrUtc;
        checkedEnd = rosterList[rosterList.size() - 1]->restStrUtc;
    }

    bool allPass = true;
    for (const auto& ruleParam : _ruleParams) {
        if (!ruleParam.MatchCrewQualification(crew, checkedStart, checkedEnd)) {
            continue;
        }
        _ruleViolation.SetRuleParam(ruleParam);
        if (!CheckRuleForCrew(ruleParam, crew, rosterList)) {
            allPass = false;
            if (!IsCheckAllRule()) {
                return false;
            }
        }
    }
    return allPass;
}

bool SingleDailyCheckinForCARSRule::CheckRuleForCrew(const SingleDailyCheckinForCARSRuleParam& ruleParam,
                                                     const SharedPtr<CREW>& crew,
                                                     const std::vector<SharedPtr<ROSTER>>& rosters) const {
    if (ruleParam._checkedGroups.empty())
        return true;

    bool bReturn = true;
    int iPrevRoster = 0;
    const std::size_t rosterSize = rosters.size();

    for (std::size_t i = 0; i < rosterSize; i++) {
        const std::string& rosterDuty = rosters[i]->duty;
        if (std::find(ruleParam._checkedGroups.begin(), ruleParam._checkedGroups.end(), rosterDuty) == ruleParam._checkedGroups.end()) {
            continue;
        }

        if (i != static_cast<std::size_t>(iPrevRoster)) {
            const auto& prevRoster = rosters[iPrevRoster];
            const auto& currRoster = rosters[i];

            const std::string prevEndStation = GetRosterEndStation(prevRoster.get());
            int offsetMinutes = 0;
            if (!prevEndStation.empty())
                offsetMinutes = this->_dbData->getAirportOffsetMinutes(prevEndStation);
            else
                offsetMinutes = this->_dbData->getAirportOffsetMinutes(crew->getPrimeBase());

            const time_t prevStartLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(prevRoster->actStrUtc, offsetMinutes);
            const time_t currStartLocalDay = Utility::GetInstancePtr()->getLocalDayStartInUTC(currRoster->actStrUtc, offsetMinutes);

            if (prevStartLocalDay == currStartLocalDay) {
                const bool isPlanning = Utility::GetInstancePtr()->isTrackingOrPlaning(currRoster->actStrUtc);
                if (!ShouldCheckPhase(ruleParam.GetPhase(), isPlanning)) {
                    continue;
                }
                if (this->_application == ROSTER_OPTIMIZER && !(currRoster->needRuleCheck) && !(prevRoster->needRuleCheck)) {
                    continue;
                }

                ThrowViolation(ruleParam, prevRoster.get(), currRoster.get(), prevStartLocalDay);
                bReturn = false;
                if (this->_application == ROSTER_OPTIMIZER) {
                    return false;
                }
            }
        }
        iPrevRoster = static_cast<int>(i);
    }
    return bReturn;
}

void SingleDailyCheckinForCARSRule::ThrowViolation(const SingleDailyCheckinForCARSRuleParam& ruleParam,
                                                   const ROSTER* /*prevRoster*/,
                                                   const ROSTER* currRoster,
                                                   time_t localDayStartUtc) const {
    const std::string msg =
        "Only one roster allowed (" + ruleParam._checkedGroupsRaw + ") in one local day.";

    RULE_LEGALITY* pLeg = _ruleViolation.GetRuleLegality();
    SharedPtr<CREW> ppCrew = this->_dbData->crewList[pLeg->crewIndex];
    pLeg->legalMessage.push_back(msg);
    _ruleViolation.SetLegalityMessage(ppCrew, msg);
    pLeg->isLegal = false;

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->crewId = ppCrew->idCrew;
    rv->rosterId = currRoster->rosterId;
    rv->startDTUtc = std::min(localDayStartUtc, currRoster->actStrUtc);
    rv->endDTUtc = std::min(localDayStartUtc + 24 * 3600, currRoster->actRestStrUtc);
    rv->violation_msg = msg;
    rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
    rv->operation_result.insert(
        std::pair<std::string, std::string>("strCheckedGroups", ruleParam._checkedGroupsRaw));
    _ruleViolation.AddRuleViolations(rv);
}
