#include "PhaseUtils.h"

#include <algorithm>

#include "Utility.h"
#include "RuleParams.h"
#include "TimeUtils.h"

bool PhaseUtils::IsChecked(const Activity* activity, const long long rulePhase, const SharedPtr<CrewDataContext>& dbData) {
	return IsChecked(activity, rulePhase, dbData.get());
}

bool PhaseUtils::IsChecked(const Activity* activity, const long long rulePhase, const CrewDataContext* dbData) {
    int application = RuleParams::GetInstancePtr()->getApplication();
    if (application == PAIRING_OPTIMIZER || application == ROSTER_OPTIMIZER || dbData->scenarioId > 0 || dbData->isServiceMode()) {
        return true;
    }

    if (rulePhase <= 0 || !const_cast<CrewDataContext*>(dbData)->IsSupportRulePhaseConfig()) {
        return true;
    }

    auto& activePhases = activity->getPhases();
    if (activePhases.empty()) {
        return true;
    }

    return activePhases.find(rulePhase) != activePhases.end();
}

bool PhaseUtils::IsChecked(const std::shared_ptr<CREW_MANDAY_BASIC>& manday, const long long rulePhase, const SharedPtr<CrewDataContext>& dbData) {
	return IsChecked(manday, rulePhase, dbData.get());
}

bool PhaseUtils::IsChecked(const std::shared_ptr<CREW_MANDAY_BASIC>& manday, const long long rulePhase, const CrewDataContext* dbData) {
    int application = RuleParams::GetInstancePtr()->getApplication();
    if (application == PAIRING_OPTIMIZER || application == ROSTER_OPTIMIZER || dbData->scenarioId > 0 || dbData->isServiceMode()) {
        return true;
    }

    if (rulePhase <= 0 || !const_cast<CrewDataContext*>(dbData)->IsSupportRulePhaseConfig()) {
        return true;
    }

    auto& activePhases = manday->phase.getPhases();
    if (activePhases.empty()) {
        return true;
    }

    return activePhases.find(rulePhase) != activePhases.end();
}

vector<std::shared_ptr<ROSTER>> PhaseUtils::Filter(const vector<std::shared_ptr<ROSTER>>& rosterList, const long long rulePhase, const SharedPtr<CrewDataContext>& dbData) {
	return Filter(rosterList, rulePhase, dbData.get());
}

vector<std::shared_ptr<ROSTER>> PhaseUtils::Filter(const vector<std::shared_ptr<ROSTER>>& rosterList, const long long rulePhase, const CrewDataContext* dbData) {
    int application = RuleParams::GetInstancePtr()->getApplication();
    if (application == PAIRING_OPTIMIZER || application == ROSTER_OPTIMIZER || dbData->scenarioId > 0 || dbData->isServiceMode()) {
        return rosterList;
    }

    if (rulePhase <= 0 || !const_cast<CrewDataContext*>(dbData)->IsSupportRulePhaseConfig()) {
        return rosterList;
    }

    vector<std::shared_ptr<ROSTER>> results;
    for (auto& roster : rosterList) {
        if (roster != nullptr && PhaseUtils::IsChecked(roster.get(), rulePhase, dbData)) {
            results.emplace_back(roster);
        }
    }
    return results;
}

vector<std::shared_ptr<CREW_MANDAY_BASIC>> PhaseUtils::Filter(const vector<std::shared_ptr<CREW_MANDAY_BASIC>>& mandayList, const long long rulePhase, const SharedPtr<CrewDataContext>& dbData) {
	return Filter(mandayList, rulePhase, dbData.get());
}

vector<std::shared_ptr<CREW_MANDAY_BASIC>> PhaseUtils::Filter(const vector<std::shared_ptr<CREW_MANDAY_BASIC>>& mandayList, const long long rulePhase, const CrewDataContext* dbData) {
    int application = RuleParams::GetInstancePtr()->getApplication();
    if (application == PAIRING_OPTIMIZER || application == ROSTER_OPTIMIZER || dbData->scenarioId > 0 || dbData->isServiceMode()) {
        return mandayList;
    }

    if (rulePhase <= 0 || !const_cast<CrewDataContext*>(dbData)->IsSupportRulePhaseConfig()) {
        return mandayList;
    }

    vector<std::shared_ptr<CREW_MANDAY_BASIC>> results;
    for (auto& manday : mandayList) {
        if (manday != nullptr && PhaseUtils::IsChecked(manday, rulePhase, dbData)) {
            results.emplace_back(manday);
        }
    }
    return results;
}
