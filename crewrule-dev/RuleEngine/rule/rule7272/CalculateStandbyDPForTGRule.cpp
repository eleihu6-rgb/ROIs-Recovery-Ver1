/**
 * @file CalculateStandbyDPForTGRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2025-02-20
**/

#include "../RuleSytem.h"
#include "CalculateStandbyDPForTGRule.h"
#include "../constant/Constants.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "Log/Logger.h"
#include "utils/CompetenceValidationUtils.h"

long CalculateStandbyDPForTGRule::Calculate(SharedPtr<ROSTER> roster, SharedPtr<ROSTER> nextRoster) {
	
	long sbyDp = -1;
	for (const auto& ruleParam : _ruleParams) {
			
		if (find(ruleParam._assignments.begin(), ruleParam._assignments.end(), roster->qualifier) == ruleParam._assignments.end()) {
			continue;
		}

		long sbyDuration = static_cast<long>(roster->getRestStartUtcAct() - roster->getStartTimeUtcAct());

		if (roster->notificationTime > 0 && nextRoster) {
			sbyDuration = static_cast<long>(roster->notificationTime - roster->getStartTimeUtcAct());
			return calculateCalloutStandby(roster->notificationTime, nextRoster, sbyDuration, ruleParam._offset, ruleParam._rate, ruleParam._sbyLimit, ruleParam._notifyLimit);
		}
		else {
			return calculateRegularStandby(sbyDuration, ruleParam._offset, ruleParam._rate);
		}

		
	}
	return sbyDp;
}

void CalculateStandbyDPForTGRule::CalculateDP(SharedPtr<ROSTER> roster, SharedPtr<ROSTER> nextRoster) {
	for (const auto& ruleParam : _ruleParams) {

		if (find(ruleParam._assignments.begin(), ruleParam._assignments.end(), roster->qualifier) == ruleParam._assignments.end()) {
			continue;
		}

		long sbyDuration = 0;

		if (roster->notificationTime > 0 && nextRoster) {
			if (roster->pairing && roster->pairing->getDutyVec().size() > 1) {
				auto& pairing = this->_dbData->pairingIdMap[roster->pairId];
				for (size_t i = 0; i < pairing->getDutyVec().size(); i++) {
					auto duty = pairing->getDuty(i);

					if (roster->notificationTime > duty->getEndTimeUtcAct()) {
						sbyDuration = static_cast<long>(duty->getEndTimeUtcAct() - duty->getStartTimeUtcAct());
						const auto& dp = calculateRegularStandby(sbyDuration, ruleParam._offset, ruleParam._rate);
						duty->setDPInSecs(dp);
						duty->setActualDP(dp / 60);
						roster->dutyValues.setActDp((int)i, dp / 60);
					}
					else {
						sbyDuration = static_cast<long>(roster->notificationTime - duty->getStartTimeUtcAct());
						const auto& dp = calculateCalloutStandby(roster->notificationTime, nextRoster, sbyDuration, ruleParam._offset, ruleParam._rate, ruleParam._sbyLimit, ruleParam._notifyLimit);
						duty->setDPInSecs(dp);
						duty->setActualDP(dp / 60);
						roster->dutyValues.setActDp((int)i, dp / 60);
						break;
					}

				}
			}
			else {
				sbyDuration = static_cast<long>(roster->notificationTime - roster->getStartTimeUtcAct());
				const auto& dp = calculateCalloutStandby(roster->notificationTime, nextRoster, sbyDuration, ruleParam._offset, ruleParam._rate, ruleParam._sbyLimit, ruleParam._notifyLimit);
				if (roster->pairing) {
					auto& pairing = this->_dbData->pairingIdMap[roster->pairId];
					for (auto duty : pairing->getDutyVec()) {
						duty->setDPInSecs(dp);
					}
				}
				else {
					roster->dpMinutes = dp / 60;
				}
				
			}

			
		}
		else {
			sbyDuration = static_cast<long>(roster->getRestStartUtcAct() - roster->getStartTimeUtcAct());

			if (roster->pairing) {
				auto& pairing = this->_dbData->pairingIdMap[roster->pairId];
				for (size_t i = 0; i < pairing->getDutyVec().size(); i++) {
					auto duty = pairing->getDuty(i);
					sbyDuration = static_cast<long>(duty->getEndTimeUtcAct() - duty->getStartTimeUtcAct());
					const auto& dp = calculateRegularStandby(sbyDuration, ruleParam._offset, ruleParam._rate);
					duty->setDPInSecs(dp);
					duty->setActualDP(dp / 60);
					roster->dutyValues.setActDp((int)i, dp / 60);

				}
			}
		}


	}
}

void CalculateStandbyDPForTGRule::CalculatePairingDP(Pairing* pairing) {
	for (const auto& ruleParam : _ruleParams) {

		if (find(ruleParam._assignments.begin(), ruleParam._assignments.end(), pairing->getQualifier()) == ruleParam._assignments.end()) {
			continue;
		}
		long sbyDuration = 0;

		for (size_t i = 0; i < pairing->getDutyVec().size(); i++) {
			auto duty = pairing->getDuty(i);
			sbyDuration = static_cast<long>(duty->getEndTimeUtcAct() - duty->getStartTimeUtcAct());
			const auto& dp = calculateRegularStandby(sbyDuration, ruleParam._offset, ruleParam._rate);
			duty->setDPInSecs(dp);
			duty->setActualDP(dp / 60);

		}

	}
}

long CalculateStandbyDPForTGRule::calculateRegularStandby(long duration, int offset, double rate) {
	return (long)(max(0L, duration - offset * 60) * rate);
}

long CalculateStandbyDPForTGRule::calculateCalloutStandby(time_t notificationTime, SharedPtr<ROSTER> nextRoster, long sbyDuration, int offset, double rate, int sbyLimit, int notifyLimit) {
	if (!nextRoster->pairing)
		return sbyDuration;

	const auto& pairing = nextRoster->pairing;
	const time_t reportTime = pairing->getFirstDuty()->getFirstBreif()->getStartTimeUtcAct();
	const long calloutDuration = static_cast<long>(reportTime - notificationTime);

	double points = 0;

	if (sbyDuration > sbyLimit * 60) {
		points = calculateRegularStandby(sbyDuration, offset, rate);
		if (calloutDuration < notifyLimit * 60) {
			points += calloutDuration * rate;
		}
	}
	else if (calloutDuration < notifyLimit * 60) {
		points = calloutDuration * rate;
	}

	return (long)points;
}


void CalculateStandbyDPForTGRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateStandbyDPForTGRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}