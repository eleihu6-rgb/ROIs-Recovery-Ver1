/**
 * @file CheckMaxFatigueScoreFor5JRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckMaxFatigueScoreFor5JRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/SegmentUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/TimeUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"
#include "index/TmCourseIndex.h"
#include "index/TmProgramIndex.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"
#include <algorithm>
#include "../period/WorkPeriod.h"
#include "../utils/PhaseUtils.h"

bool CheckMaxFatigueScoreFor5JRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool passAllRule = true;

	const auto& crewId = rosters[0]->idcrew;
	const auto& crew = this->_dbData->crewIdMap[crewId];

	for (const auto& _ruleParam : _ruleParams) {
		if (_ruleParam.GetClassType() == RuleClassType::PO)
			continue;
		_ruleViolation.ClearParam();
		_ruleViolation.SetRuleParam(_ruleParam);
		_ruleViolation.SetParam("crew_id", crewId);

		for (size_t i = 0; i < rosters.size(); i++) {
			if(rosters[i] != nullptr && !PhaseUtils::IsChecked(rosters[i], _ruleParam.GetPhase(), this->_dbData)) {
				continue;
			}
			if (rosters[i]->pairing) {
				if (this->_dbData->fatigueMap.find(rosters[i]->rosterId) == this->_dbData->fatigueMap.end())
					continue;
				const auto& fatigueDutyMap = this->_dbData->fatigueMap.at(rosters[i]->rosterId);
				const auto& duties = rosters[i]->pairing->getDutyVec();
				if (duties.empty())
					continue;
				for (int j = 0; j < duties.size(); j++) {
					const auto& fatigueScoreIt = fatigueDutyMap.find(duties[j]->getDutyId());

					if (fatigueScoreIt == fatigueDutyMap.end())
						continue;

					if (fatigueScoreIt->second->maxSp.empty())
						continue;
					
					vector<string> maxSPList;
					split(fatigueScoreIt->second->maxSp, '|', maxSPList);

					double fatigueScore = stod(maxSPList[0]);

					const double discretion = _ruleParam.GetDiscretion(duties[j]);

					if (discretion > 0.0) {
						auto discretions = rosters[i]->pairing->getDuty(j)->getDiscretionTypes();

						discretions.push_back(DiscretionType::FATIGUE);

						auto duty = this->_dbData->pairingIdMap[rosters[i]->pairId]->getDuty(j);

						rosters[i]->pairing->getDuty(j)->setDiscretionTypes(discretions);
						duty->setDiscretionTypes(discretions);
						auto discretionTypes = duty->getOriginDiscretionType();
						if (!discretionTypes.empty()) {
							discretionTypes += ",";
						}
						discretionTypes = DiscretionType::FATIGUE;
						duty->setOriginDiscretionType(discretionTypes);
					}
					
					if (fatigueScore > _ruleParam._maxDutyFatigueValue + discretion) {
						_ruleViolation.SetParam("pairing_id", to_string(rosters[i]->pairId));
						_ruleViolation.SetParam("roster_id", to_string(rosters[i]->rosterId));
						_ruleViolation.SetParam("start", to_string(duties[j]->getStartTimeUtcAct()));
						_ruleViolation.SetParam("end", to_string(duties[j]->getEndTimeUtcAct()));
						_ruleViolation.SetParam("maxSp", StringUtils::dtos(fatigueScore));
						
						_ruleViolation.SetParam("maxDutyFatigue", StringUtils::dtos(_ruleParam._maxDutyFatigueValue + discretion));
						ThrowRuleViolation();
						passAllRule = false;
					}
				}
			}
		}
	}

	return passAllRule;

}

void CheckMaxFatigueScoreFor5JRule::ThrowRuleViolation() const {
	const auto& crewId = _ruleViolation.GetParam("crew_id");
	const auto& pairingId = _ruleViolation.GetParam("pairing_id");
	const auto& rosterId = _ruleViolation.GetParam("roster_id");
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	const auto& maxSp = _ruleViolation.GetParam("maxSp");
	const auto& maxDutyFatigue = _ruleViolation.GetParam("maxDutyFatigue");
	string msg = "The fatigue score ({0:maxSp}) exceeds the maximum threshold({1:maxDutyFatigue}).";
	msg = StringUtils::Format(msg, maxSp, maxDutyFatigue);
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	rv->crewId = crewId;
	rv->pairingId = stoll(pairingId);
	rv->rosterId = stoll(rosterId);
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckMaxFatigueScoreFor5JRule::ParseParam(const InputType& input) {
	//add by hexd ???DBRule???
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMaxFatigueScoreFor5JRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}
