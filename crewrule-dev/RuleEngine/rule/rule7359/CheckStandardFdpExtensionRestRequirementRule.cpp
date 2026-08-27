/**
 * @file CheckStandardFdpExtensionRestRequirementRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckStandardFdpExtensionRestRequirementRule.h"
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
#include "../period/BaseActivityPeriod.h"

bool CheckStandardFdpExtensionRestRequirementRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool passAllRule = true;

	const auto& crewId = rosters[0]->idcrew;
	const auto& crew = this->_dbData->crewIdMap[crewId];
	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}

	const auto & activities = BaseActivityPeriod::GetActivityPeriodsOfDuty(rosters);

	for (const auto& _ruleParam : _ruleParams) {
		if (_ruleParam.GetClassType() == RuleClassType::PO)
			continue;
		if (!_ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.ClearParam();
		_ruleViolation.SetRuleParam(_ruleParam);
		_ruleViolation.SetParam("crew_id", crewId);

		for (size_t i = 0; i < activities.size(); i++) {
			
			shared_ptr<BaseActivityPeriod> prevActivity = nullptr;
			if (i > 0) {
				prevActivity = activities[i - 1];
			}
			shared_ptr<BaseActivityPeriod> nextActivity = nullptr;
			if (i < activities.size() - 1) {
				nextActivity = activities[i + 1];
			}

			const auto& currentActivity = activities[i];
			
			if (currentActivity->GetRoster() && currentActivity->GetRoster()->pairing) {
				const auto& duty = (Duty*)currentActivity->GetActivity();

				if (_ruleParam.MatchRuleParam(duty)) {
					
					if (!_ruleParam.CheckExtendedRestDistribution(prevActivity, nextActivity, duty)) {
						if (this->_application == ROSTER_OPTIMIZER) {
							return false;
						}
							
						_ruleViolation.SetParam("pairing_id", to_string(currentActivity->GetRoster()->pairId));
						_ruleViolation.SetParam("duty_seq", to_string(duty->getDutySegNum()));
						_ruleViolation.SetParam("roster_id", to_string(currentActivity->GetRoster()->rosterId));
						_ruleViolation.SetParam("duty_attributes", joinStrList(_ruleParam._overrideDutyAttributes, "|"));
						_ruleViolation.SetParam("rest_extension", TimeUtils::MinutesTohhmm(_ruleParam._restExtention));
						_ruleViolation.SetParam("start", to_string(duty->getStartTimeUtcAct()));
						_ruleViolation.SetParam("end", to_string(duty->getEndTimeUtcAct()));
						ThrowRuleViolation();
						passAllRule = false;
					}

				}
			}
		}
	}

	return passAllRule;

}

void CheckStandardFdpExtensionRestRequirementRule::ThrowRuleViolation() const {
	const auto& crewId = _ruleViolation.GetParam("crew_id");
	const auto& pairingId = _ruleViolation.GetParam("pairing_id");
	const auto& rosterId = _ruleViolation.GetParam("roster_id");
	const auto& dutySeq = _ruleViolation.GetParam("duty_seq");
	const auto& dutyAttributes = _ruleViolation.GetParam("duty_attributes");
	const auto& restExtension = _ruleViolation.GetParam("rest_extension");
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0);
	string msg = "The additional rest before or after the duty with the attribute ({0:dutyAttributes}) shall be at least {1:restExtension}.";
	msg = StringUtils::Format(msg, dutyAttributes, restExtension);
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
	rv->crewId = crewId;
	rv->pairingId = stoll(pairingId);
	rv->dutySequenceNumber = stoi(dutySeq);
	rv->rosterId = stoll(rosterId);
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = msg;
	_ruleViolation.AddRuleViolations(rv);
}


void CheckStandardFdpExtensionRestRequirementRule::ParseParam(const InputType& input) {
	//add by hexd ???DBRule???
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckStandardFdpExtensionRestRequirementRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

}
