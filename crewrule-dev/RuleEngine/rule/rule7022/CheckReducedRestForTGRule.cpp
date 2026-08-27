/**
 * @file CheckReducedRestForTGRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-06-26
**/

#include "../RuleSytem.h"
#include "CheckReducedRestForTGRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"


bool CheckReducedRestForTGRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	bool passAllRule = true;
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();

	for (const auto& _ruleParam : _ruleParams) {
		passAllRule = CheckMaxTimesBetweenDO(rosters, _ruleParam);
	}

	return passAllRule;
}

bool CheckReducedRestForTGRule::CheckMaxTimesBetweenDO(const std::vector<const ROSTER*>& rosters, const CalculateReducedRestForTGRuleParam& ruleParam) const {
	bool passAllRule = true;
	int count = 0;
	int startIndex = 0;
	bool findDO = false;
	for (size_t i = 0; i < rosters.size(); i++) {
		if (ruleParam.MatchDOAssignment(rosters[i]->qualifier)) {
			if (!findDO)
				findDO = true;
			if (startIndex == 0) {
				startIndex = (int)i;
			}
			else {
				if (ruleParam._maxTimesBetweenDO < count) {
					if (this->_application == ROSTER_OPTIMIZER) {
						return false;
					}
					_ruleViolation.SetParam("start", to_string(rosters[startIndex]->getEndTimeUtcAct()));
					_ruleViolation.SetParam("end", to_string(rosters[i]->getStartTimeUtcAct()));
					_ruleViolation.SetParam("maxLimit", to_string(ruleParam._maxTimesBetweenDO));
					_ruleViolation.SetParam("actCount", to_string(count));
					passAllRule = false;
				}
				count = 0;
				startIndex = (int)i;
			}
		}
		else {
			const auto& duties = rosters[i]->pairing->getDutyVec();
			for (const auto& duty : duties) {
				if (findDO && find(duty->getDiscretionTypes().begin(), duty->getDiscretionTypes().end(), DiscretionType::REST) != duty->getDiscretionTypes().end()) {
					count++;
				}
			}
		}
		
	}
	return passAllRule;
}

void CheckReducedRestForTGRule::ThrowRuleViolation() const {
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	const auto& maxLimit = _ruleViolation.GetParam("maxLimit");
	const auto& actCount = _ruleViolation.GetParam("actCount");
	const auto& crewId = _ruleViolation.GetParam("crewId");


	std::string msg = "Rest period can't be reduced {0:actCount} times between {1:maxLimit} RERRPs.";
	msg = StringUtils::Format(msg, actCount, maxLimit);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;

	rv->crewId = crewId;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;

	rv->violation_msg = msg;
	_ruleViolation.AddRuleViolations(rv);
}

void CheckReducedRestForTGRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateReducedRestForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
}