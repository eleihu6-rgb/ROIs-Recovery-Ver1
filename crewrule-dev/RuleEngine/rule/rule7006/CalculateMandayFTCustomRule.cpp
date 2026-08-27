#include "CalculateMandayFTCustomRule.h"
#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
// #include "orlog.h"
#include <OrLog.h>
#include "RuleParams.h"
#include "UtilDbg.h"
#include "StringUtil.h"
// #include "customBiz\customBiz.h"
#include "CalculateMandayFTCustomRuleParam.h"
#include "../utils/DutyUtils.h"
#include "../constant/Constants.h"
#include "../utils//TimeUtils.h"

double CalculateMandayFTCustomRule::Calculate(Segment *segment) {
	// 没有参数返回100%
	if (this->_ruleParams.empty()) {
		return NULL;
	}
	
	return CalculatePercent(segment);
}

double CalculateMandayFTCustomRule::CalculatePercent(Segment * segment) {
	// 初始化默认百分比
	double result = NULL;
	string division = this->_dbData->scenario.division;
	for (const auto & _ruleParam : _ruleParams) {
		if (division == _ruleParam._division) {
			if (_ruleParam._flightTimeStart != -1 && _ruleParam._flightTimeEnd != -1) {
				int flightTime = static_cast<int>(segment->getEndTimeUtcAct() - segment->getStartTimeUtcAct());

				if (flightTime < _ruleParam._flightTimeStart * 60 || flightTime > _ruleParam._flightTimeEnd * 60)
				continue;
			}
			
			if (_ruleParam._composition != "*") {
				auto duty = this->_dbData->pairingIdMap[segment->getPairingId()]->getDuty(segment->getDutySeq() - 1);
				string composition = duty->getCompositionName();
				if (composition == "" || this->_application == PAIRING_EDITOR || this->_application == ROSTER_EDITOR)
				{
					composition = DutyUtils::GetCompositionByDutyFor3(duty, this->_dbData, division);
					//strComplement = this->pairingCompositionCalculator->calculatePairingCompositionForPilotR5_3007(duty);
					duty->setCompositionName(composition);
				}
				if (_ruleParam._composition != composition)
					continue;
			}

			if (!_ruleParam._assignments.empty() && _ruleParam._assignments[0] != "*") {
				if (find(_ruleParam._assignments.begin(), _ruleParam._assignments.end(), segment->getAssignment()) == _ruleParam._assignments.end())
					continue;
			}
			result = _ruleParam._percent;
			return result;
		}
	}
	return result;
}

void CalculateMandayFTCustomRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateMandayFTCustomRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}