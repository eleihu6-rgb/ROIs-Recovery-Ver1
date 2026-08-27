#include "../RuleSytem.h"
#include "LimitConsecutiveWoclForCARSRule.h"

#include "../period/WorkPeriod.h"
#include "Duty.h"
#include "utils/TimeUtils.h"
#include "utils/RosterUtils.h"
#include "utils/DutyUtils.h"

#include <climits>

bool LimitConsecutiveWoclForCARSRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (_ruleParams.empty() || rosters.empty()) {
		return true;
	}
	bool isValid = true;
	int startLoc = 0;
	int endLoc = 0;

	auto tmpWorkPeriods = WorkPeriod::GetWorkFDPPeriods(rosters, this->_dbData);
	std::vector<std::shared_ptr<WorkPeriod>> tmpWorkPeriods2;
	for (auto& tmpWorkPeriod : tmpWorkPeriods) {
		tmpWorkPeriods2.emplace_back(std::move(tmpWorkPeriod));
	}

	time_t checkedStartTime = 0;
	time_t checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER) {
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	} else {
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	const std::string crewBase = crew->getPrimeBase();
	const int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());

	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.SetRuleParam(ruleParam);
		startLoc = ruleParam._woclStart;
		endLoc = ruleParam._woclEnd;

		std::vector<std::shared_ptr<WorkPeriod>> workPeriods;
		for (auto& tmpWorkPeriod : tmpWorkPeriods2) {
			if (tmpWorkPeriod->GetWorkType() == WorkType::FltDuty
				&& RosterUtils::ExistExceptionCode(tmpWorkPeriod->GetRoster(), (Duty*)tmpWorkPeriod->GetWork(), ruleParam.GetExceptionCodes(), _dbData)) {
				continue;
			}
			workPeriods.emplace_back(tmpWorkPeriod);
		}

		std::vector<std::shared_ptr<WorkPeriod>> consecutive_wocl_duties;
		for (size_t i = 0; i < workPeriods.size(); i++) {
			if (workPeriods[i]->GetWorkType() == GroundRoster) {
				consecutive_wocl_duties.clear();
				continue;
			}

			bool isWOCLDuty = false;
			const auto& fdpStartUtc = workPeriods[i]->GetFDPStartTimeUTC();
			const auto& fdpEndUtc = workPeriods[i]->GetFDPEndTimeUTC();

			const int accOffsetMinutes = GetAdjustOffsetTZ(workPeriods[i], offsetTZMinutes);

			if (fdpStartUtc <= 0 || fdpEndUtc <= 0) {
				isWOCLDuty = false;
			} else {
				isWOCLDuty = TimeUtils::IsTimesCovered(fdpStartUtc + accOffsetMinutes * 60, fdpEndUtc + accOffsetMinutes * 60, startLoc, endLoc);
			}

			if(!isWOCLDuty) {
				consecutive_wocl_duties.clear();
				continue;
			}

			// 如果是WOCL duty，检查间距是否覆盖一个完整的local night rest.
			// 1. 如果consecutive_wocl_duties为空,说明是第一个WOCL duty,直接添加
			if(consecutive_wocl_duties.empty()){
				consecutive_wocl_duties.push_back(workPeriods[i]);
			}
			else{
				time_t restPeriodStartUtc = consecutive_wocl_duties.at(consecutive_wocl_duties.size() - 1)->GetEndTimeUTC();
				time_t restPeriodEndUtc = workPeriods[i]->GetStartTimeUTC();

				int newOffsetTZMinutes = GetAdjustOffsetTZ(workPeriods[i], offsetTZMinutes);
				int localNightNum = DutyUtils::GetLocalNightNums(restPeriodStartUtc, restPeriodEndUtc, newOffsetTZMinutes);

				if (localNightNum < 1) {
					consecutive_wocl_duties.push_back(workPeriods[i]);
				} else {
					consecutive_wocl_duties.clear();
					consecutive_wocl_duties.push_back(workPeriods[i]);
				}
			}

			if ((int)consecutive_wocl_duties.size() > ruleParam._maxConsecutiveWoclNumber) {
				if (this->_application == ROSTER_OPTIMIZER) {
					return false;
				}
				_ruleViolation.SetParam("number", std::to_string(consecutive_wocl_duties.size()));
				_ruleViolation.SetParam("start", std::to_string(consecutive_wocl_duties[0]->GetStartTimeUTC()));
				_ruleViolation.SetParam("end", std::to_string(consecutive_wocl_duties[consecutive_wocl_duties.size() - 1]->GetEndTimeUTC()));
				_ruleViolation.SetParam("max_limit", std::to_string(ruleParam._maxConsecutiveWoclNumber));
				ThrowRuleViolationForDutyNumber();
				consecutive_wocl_duties.clear();
			}
		}
	}

	return isValid;
}

int LimitConsecutiveWoclForCARSRule::GetAdjustOffsetTZ(const std::shared_ptr<WorkPeriod>& workPeriod, const int offsetTZMinutes) const {
	const int accAtStart = workPeriod->GetAccTimezoneAtStart();
	if (accAtStart >= 0) {
		return accAtStart;
	}
	if (workPeriod->GetWorkType() == WorkType::FltDuty && workPeriod->GetWork() != nullptr) {
		const auto* duty = static_cast<const Duty*>(workPeriod->GetWork());
		const int refTz = duty->getRefTimeZone();
		if (refTz != INT_MIN) {
			return refTz;
		}
	}
	return offsetTZMinutes;
}

void LimitConsecutiveWoclForCARSRule::ThrowRuleViolationForDutyNumber() const {
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	string msg = "Concecutive WOCL duties(" + _ruleViolation.GetParam("number") + ") is more than the limitation(" + _ruleViolation.GetParam("max_limit") + ").";

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	rv->startDTUtc = stol(_ruleViolation.GetParam("start"));
	rv->endDTUtc = stol(_ruleViolation.GetParam("end"));
	rv->crewId = ppCrew->idCrew;
	rv->violation_msg = msg;
	rv->description = _ruleParams[0].GetDescription();
	rv->idRule = _ruleParams[0].GetId();
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("iConsecutiveWOCLDutyies", _ruleViolation.GetParam("consecutive_wocl_duties")));
	rv->operation_result.insert(pair<string, string>("strMaxTimes", _ruleViolation.GetParam("max_limit")));
	_ruleViolation.AddRuleViolations(rv);
}

void LimitConsecutiveWoclForCARSRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitConsecutiveWoclForCARSRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}

	// parse DailyAdjustment to get the adaption period information from rule 7500 table 2
	for (const auto& dbDepRule : input.dependDbRules) {
		if (dbDepRule.first == RULES::ACCLIMATISATION_DEFINITION_FOR_CARS) {
			for (const auto& dbRule : dbDepRule.second) {
				if (dbRule.tableNum == 2) {
					_ruleParamsOfDailyAdjustment.emplace_back(DailyAdjustmentForCARSParam::GetInstance(this));
					auto& newParam = _ruleParamsOfDailyAdjustment.back();
					newParam.ParseParam(dbRule);
				}
			}
		}
	}

	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitConsecutiveWoclForCARSRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}
