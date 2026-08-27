/**
 * @file AdaptionPeriodRule.cpp
 * @brief
 * @author aspen.sang
 * @email yang.sang@pi-solution.com
 * @version 1.0
 * @date 2024-08-06
**/

#include "../RuleSytem.h"
#include "AdaptionPeriod4MaxFDPRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "../rule6005/AdaptionPeriodParam.h"
#include "TimezoneUtils.h"

bool AdaptionPeriod4MaxFDPRule::CheckRule(const Pairing* pairing) const {	
	return CheckRule(pairing->getDutyVec());
}

bool AdaptionPeriod4MaxFDPRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
	return CheckRule(duties);
}

// this function is used to check if the pairings are following this 6038 rule. 
// if this paring is checked fail, then set a violation warning and update the min rest value as adaption period.
// adaption period values are defined in rule 6005 table 2
bool AdaptionPeriod4MaxFDPRule::CheckRule(const vector<Duty*>& duties) const {
	if (duties.empty()) {
		return true;
	}
	bool passAllRule = true;
	// quantity of duties
	int iQty_duties = (int)duties.size();
	// quantity of consecutive unknon Acc duties
	int iQty_unknown_Acc = 0;	
	for (std::size_t i = 1; i < duties.size(); i++){
		if (duties[i]->getAcclimatisedState() == AcclimatizationState::UNKNOWN) {
			iQty_unknown_Acc++; // increase 1 if the duty is UNKNOWN ACC			
		}
		else {
			iQty_unknown_Acc = 0; // if the duty is not unknown state, then the consucutive unknown duties is stopped
		}
	}
	
	// get the Parameters that set in the rule 6038
	for (const auto& ruleParam : _ruleParams) {
		// if Qty of Quties is equal or bigger than MaxConsecutiveDuties setting and Qty of unknow ACCC duties is equal of bigger
		// than MaxUnknowStatesACC setting, then set adaption persion as min rest to the duty that index is MaxConsecutiveDuties		
		if (iQty_duties >= ruleParam.GetMaxConsecutiveDuties() && iQty_unknown_Acc >= ruleParam.GetMaxUnknownStatesOfACC()) {
			// get the adaption period of this pairing

			// Get Duty's TZ and Ref TZ
			Duty* lstDuty = duties[ruleParam.GetMaxConsecutiveDuties() - 1];
			if (lstDuty->getAcclimatisedState() == AcclimatizationState::UNKNOWN) {
				Duty* lastAcclimatisedDuty = lstDuty->getLastAcclimatisedDuty();
				Duty* maxTimeZoneDiffDuty = lstDuty->getMaxTimeZoneDiffDuty();
				int maxTimeZoneDiff = TimezoneUtils::abs(DutyUtils::GetTimeZoneDiff(*lastAcclimatisedDuty, *maxTimeZoneDiffDuty, _dbData));

				string displacementDirection{ "0" };

				// choose the correct adaption peirod item according to the direction and TimeZone gap
				int iAdaptionPeriodMintues = 0;
				for (auto& adaptionPeriodParam : _ruleParamsOfAdpPeriod) {
					if ((int)maxTimeZoneDiff >= adaptionPeriodParam.get_timezoneDiffMinutesLower()
						&& (int)maxTimeZoneDiff < adaptionPeriodParam.get_timezoneDiffMinutesUpper()) {
						string displacementDirection = DutyUtils::GetDisplacementDirection(*lastAcclimatisedDuty, *maxTimeZoneDiffDuty, _dbData);
						if (displacementDirection == adaptionPeriodParam.get_direction()) {
							iAdaptionPeriodMintues = adaptionPeriodParam.get_adaptionPeriodMinutes();

							// set min Rest
							lstDuty->setMinRest(iAdaptionPeriodMintues);
							//register violation warning
							lstDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, iAdaptionPeriodMintues, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());
							// cout << "Rule 6038: " << lstDuty->getPairingNum() << " " << maxTimeZoneDiff << " " << displacementDirection << "-" << iAdaptionPeriodMintues << "-" << lstDuty->getMinRest() << " unknow status Duties" << endl;
						}
					}
				}
			}
		} // end if last duty
	} // end for _ruleParams

	return passAllRule;
}

void AdaptionPeriod4MaxFDPRule::ParseParam(const InputType& input) {
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(AdaptionPeriod4MaxFDPRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	// parse AdaptionPeriod to get the adaption period information from rule 6005 table 2
	for (const auto& dbDepRule : input.dependDbRules) {		
		if (dbDepRule.first == RULES::ALLIANCE_ACCLIMATISATION_DEFINITION ){//}.tableNum == 2) {
			for (const auto& dbRule : dbDepRule.second) {
				if (dbRule.tableNum == 2) {					
					_ruleParamsOfAdpPeriod.emplace_back(AdaptionPeriodParam::GetInstance(this));
					auto& newParam = _ruleParamsOfAdpPeriod.back();
					newParam.ParseParam(dbRule);
				}
			}
		}
	}
	
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(AdaptionPeriod4MaxFDPRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}
