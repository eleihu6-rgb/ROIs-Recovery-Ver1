#include "CheckMaxConsecutiveDayRule.h"

#include "Utility.h"

#include <ctime>
#include <algorithm>

#include "CrewDB.h"
#include "UtilFunc.h"
#include "UtilDbg.h"
#include "utils/StringUtils.h"
#include "CheckMaxConsecutiveDayRuleParam.h"
#include "utils/DutyUtils.h"
#include "TimezoneUtils.h"

#include <bitset>


//按crew检查
bool CheckMaxConsecutiveDayRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool isValid = true;
	if (rosters.empty()) {
		return true;
	}
	const auto & crew = this->_dbData->crewIdMap.at(rosters[0]->idcrew);

	//const auto & dutyBuilder = this->_dbData->_ruleFuncMap[RULES::MAX_CONSECUTIVE_DUTY_DAYS_QQ];
	//if (dutyBuilder.empty()) {
	//	return true;
	//}
	time_t rollingWindow_start, rollingWindow_end;

	rollingWindow_start = this->_dbData->scenario.startDtUTC;
	rollingWindow_end = this->_dbData->scenario.endDtUTC + 24 * 3600;
	vector<Duty*> dutyVec;
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, _dbData->scenario.startDtUTC);
	auto CrewBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);

	for (auto& rp : this->_dbData->rosterPeriodList)
	{
		_ruleViolation.ClearParam();
		_ruleViolation.SetParam("offsetTZMinute", StringUtils::itos(CrewBaseOffsetMinutes));
		auto start = rp.rp_start;
		auto end = rp.rp_end + 24 * 3600 - 1;
		//一个RP周期内只能有一个连续6天的任务
		if (Utility::GetInstancePtr()->isTimeOverlap(start, end, rollingWindow_start, rollingWindow_end))
		{
			/*_ruleViolation.SetParam("start", to_string(rp.rp_start));
			_ruleViolation.SetParam("end", to_string(rp.rp_end));*/
			std::vector<const ROSTER*> rostersInRange;
			/*for (std::size_t i = 0; i < rosters.size(); i++)
			{
				if (Utility::GetInstancePtr()->isTimeOverlap(const_cast<ROSTER*>(rosters[i])->getStartTimeUtcAct() + CrewBaseOffsetMinutes * 60, const_cast<ROSTER*>(rosters[i])->getRestStartUtcAct() + CrewBaseOffsetMinutes * 60, start - 7 * (24 * 3600), end)) {
					rostersInRange.push_back(rosters[i]);
				}
			}*/
			for (const auto & ruleParam : _ruleParams) {
				
				if (!ruleParam.MatchCrewQualification(crew, start, end)) {
					continue;
				}
				this->_ruleViolation.SetRuleParam(ruleParam);
				_ruleViolation.SetParam("crew_id", crew->idCrew);
				_ruleViolation.SetParam("add_max_day_times", std::to_string(ruleParam._addMaxNumber));
				bool isAllPreassiged = true;

				const auto inRP = ruleParam._maxConsecutiveDayInRP > 0;
				const auto actMax = inRP ? ruleParam._maxConsecutiveDayInRP : ruleParam._maxConsecutiveTime;
				// rp往前加载几天的数据
				const auto& leadinAndLeadoutRange = ruleParam._addMaxConsecutiveTime > 0 ? ruleParam._addMaxConsecutiveTime : (inRP ? 0 : ruleParam._maxConsecutiveTime);
				const auto& rpStartIndex = leadinAndLeadoutRange > 0 ? leadinAndLeadoutRange : 0;
				const auto& rpEndIndex = rpStartIndex + 27;
				const auto & dutyDay = GetDutyDayInRPRange(rosters, ruleParam._dutyAssignments, start, end, CrewBaseOffsetMinutes, leadinAndLeadoutRange, ruleParam._isAddMaxInRP);
				isValid = CheckConsecutiveDay(dutyDay, actMax, ruleParam._addMaxConsecutiveTime, ruleParam._unit, ruleParam._addMaxNumber, leadinAndLeadoutRange, start, ruleParam._isAddMaxInRP, rpStartIndex, rpEndIndex);
				
			}
		}
	}
	return isValid;
}

std::bitset<50> CheckMaxConsecutiveDayRule::GetDutyDayInRPRange(const std::vector<const ROSTER*>& rosters, const std::vector<string> dutyAssignments, time_t rpStartUtc, time_t rpEndUtc, int CrewBaseOffsetMinutes, int maxConsecutiveDay, string isAddMaxInRP) const {
	std::bitset<50> dutyDay;
	rpStartUtc = rpStartUtc - maxConsecutiveDay * (24 * 3600);
	if (isAddMaxInRP != "") {
		rpEndUtc = rpEndUtc + maxConsecutiveDay * (24 * 3600);
	}
	for (const auto & roster : rosters) {
		// 存在pairing
		if (roster->pairing != nullptr) {
			const auto & duties = roster->pairing->getDutyVec();
			for (const auto & duty : duties) {
				if (!dutyAssignments.empty() && find(dutyAssignments.begin(), dutyAssignments.end(), duty->getAssignment()) == dutyAssignments.end()) {
					continue;
				}

				int offset = DutyUtils::GetTimeZoneOffset(*duty, this->_dbData);
				time_t dutyStart = duty->getStartTimeUtcAct() + offset * 60;
				time_t dutyEnd = duty->getEndTimeUtcAct() + offset * 60;
				if (dutyStart >= rpEndUtc || dutyEnd <= rpStartUtc) {
					continue;
				}
				if (dutyStart < rpStartUtc && dutyEnd <= rpEndUtc) {
					dutyStart = rpStartUtc;
				}
				else if (dutyStart >= rpStartUtc && dutyEnd > rpEndUtc) {
					dutyEnd = rpEndUtc;
				}

				int days = static_cast<int>(dutyEnd - dutyStart) / (3600 * 24);
				int startDay = static_cast<int>(dutyStart - rpStartUtc) / (3600 * 24);
				if (days == 0) {
					if (startDay < 50) {
						dutyDay.set(startDay, true);
					}
				}
				for (int i = 0; i < days; i++) {
					if ((startDay + i) < 50) {
						dutyDay.set(startDay + i, true);
					}
				}
			}
		}
		// 地面任务
		else {
			/*if (roster->isMergeFdpWithFly) {*/
			if (!dutyAssignments.empty() && find(dutyAssignments.begin(), dutyAssignments.end(), roster->qualifier) == dutyAssignments.end()) {
				continue;
			}
			string depZoneId = this->_dbData->getAirportZoneId(roster->location);
			int offset = TimezoneUtils::GetTimezoneOffset(roster->getStartTimeUtcAct(), depZoneId);
			time_t rosterStart = const_cast<ROSTER*>(roster)->getStartTimeUtcAct() + offset * 60;
			time_t rosterEnd = const_cast<ROSTER*>(roster)->getEndTimeUtcAct() + offset * 60;
			if (rosterStart >= rpEndUtc || rosterEnd <= rpStartUtc) {
				continue;
			}
			if (rosterStart < rpStartUtc && rosterEnd <= rpEndUtc) {
				rosterStart = rpStartUtc;
			}
			else if (rosterStart >= rpStartUtc && rosterEnd > rpEndUtc) {
				rosterEnd = rpEndUtc;
			}
			int days = static_cast<int>(rosterEnd - rosterStart) / (3600 * 24);
			int startDay = static_cast<int>(rosterStart - rpStartUtc) / (3600 * 24);
			if (days == 0) {
				if (startDay < 50) {
					dutyDay.set(startDay, true);
				}
			}
			for (int i = 0; i < days; i++) {
				if ((startDay + i) < 50) {
					dutyDay.set(startDay + i, true);
				}
			}
			//}
		}
	}
	return dutyDay;
}

bool CheckMaxConsecutiveDayRule::CheckConsecutiveDay(const std::bitset<50> & dutyDay, int maxConsecutiveDay, int addMaxConsecutiveDay, string unitParam, int addMaxNumber, int leadinRange, time_t rpStartUtc, string isAddMaxInRP, int rpStartIndex, int rpEndIndex) const {
	int days = 0;
	//int maxDays = 0;
	bool check = true;
	int usedAddMaxNumber = 0;
	int unit = 0;
	rpStartUtc = rpStartUtc - leadinRange * (24 * 3600);
	//记录连续duty开始，提供告警信息
	int checkDayStartIndex = -1;
	time_t start = rpStartUtc;
	if (unitParam == "CD") {
		unit = 1;
	}
	for (int i = 0; i < 50; i++) {
		if (dutyDay.test(i)) {
			if (checkDayStartIndex < 0) {
				checkDayStartIndex = i;
				start = rpStartUtc + checkDayStartIndex * (3600 * 24);
			}
			days++;
			
			if (i != 49) {
				// 如果后面一天没有任务，check
				if (!dutyDay.test(i + 1)) {
					// 大于最大的连续天数，直接违规
					if (days > addMaxConsecutiveDay * unit) {
						_ruleViolation.SetParam("add_max_day", std::to_string(addMaxConsecutiveDay * unit));
						_ruleViolation.SetParam("act_max_day", std::to_string(days));
						_ruleViolation.SetParam("start", to_string(start));
						_ruleViolation.SetParam("end", to_string(start + days * 3600 * 24 - 1));
						ThrowRuleViolation();
						check = false;
					} 
					else if (days > maxConsecutiveDay * unit) {
						//为*，则不管是RP内或者是跨RP
						if (isAddMaxInRP == "*" || isAddMaxInRP == "")
							++usedAddMaxNumber;
						//Y, 只计算RP内
						else if (isAddMaxInRP == "Y" && i - rpStartIndex + 1 >= addMaxConsecutiveDay && i <= rpEndIndex)
							++usedAddMaxNumber;
						//N，只计算跨RP的
						else if (isAddMaxInRP == "N" && (i - rpStartIndex + 1 < addMaxConsecutiveDay || rpEndIndex - i < addMaxConsecutiveDay))
							++usedAddMaxNumber;

						if (addMaxNumber == 0) {
							_ruleViolation.SetParam("add_max_day", std::to_string(maxConsecutiveDay * unit));
							_ruleViolation.SetParam("act_max_day", std::to_string(days));
							_ruleViolation.SetParam("start", to_string(start));
							_ruleViolation.SetParam("end", to_string(start + (days - 1) * 3600 * 24));
							check = false;
							ThrowRuleViolation();
						} 
						else if (usedAddMaxNumber > addMaxNumber) {

							_ruleViolation.SetParam("act_max_day", std::to_string(addMaxConsecutiveDay * unit));
							_ruleViolation.SetParam("act_max_day_times", std::to_string(addMaxNumber));
							_ruleViolation.SetParam("start", to_string(start));
							_ruleViolation.SetParam("end", to_string(start + (days - 1) * 3600 * 24));
							check = false;
							ThrowRuleViolation();
						}
					}
					days = 0;
					checkDayStartIndex = -1;
				}
			}
			else {
				if (days > addMaxConsecutiveDay * unit) {
					check = false;
					_ruleViolation.SetParam("add_max_day", std::to_string(addMaxConsecutiveDay * unit));
					_ruleViolation.SetParam("act_max_day", std::to_string(days));
					_ruleViolation.SetParam("start", to_string(start));
					_ruleViolation.SetParam("end", to_string(start + (days - 1) * 3600 * 24));
					ThrowRuleViolation();
				}
				else if (days > maxConsecutiveDay * unit) {
					if (isAddMaxInRP == "*" || isAddMaxInRP == "")
						++usedAddMaxNumber;
					//Y, 只计算RP内
					else if (isAddMaxInRP == "Y" && i - rpStartIndex + 1 >= addMaxConsecutiveDay && rpEndIndex - i >= addMaxConsecutiveDay)
						++usedAddMaxNumber;
					//N，只计算跨RP的
					else if (isAddMaxInRP == "N" && (i - rpStartIndex + 1 < addMaxConsecutiveDay || rpEndIndex - i < addMaxConsecutiveDay))
						++usedAddMaxNumber;
					if (usedAddMaxNumber > addMaxNumber) {
						_ruleViolation.SetParam("act_max_day", std::to_string(addMaxConsecutiveDay * unit));
						_ruleViolation.SetParam("act_max_day_times", std::to_string(addMaxNumber));
						_ruleViolation.SetParam("start", to_string(start));
						_ruleViolation.SetParam("end", to_string(start + (days - 1) * 3600 * 24));
						check = false;
						ThrowRuleViolation();
					}
					else {
						++usedAddMaxNumber;
					}
				}
			}
			
		}
	}
	return check;
}

void CheckMaxConsecutiveDayRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMaxConsecutiveDayRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}


void CheckMaxConsecutiveDayRule::ThrowRuleViolation() const {
	string errorMsg;
	if (_ruleViolation.GetParam("act_max_day_times").empty()) {
		errorMsg = "Actual consecutive working days: {0:act_max_day} is greater than the maximum consecutive working days allowed: {1:add_max_day}";
		errorMsg = StringUtils::Format(errorMsg, _ruleViolation.GetParam("act_max_day"), _ruleViolation.GetParam("add_max_day"));
	}
	else {
		errorMsg = "Actual consecutive working days: {0:act_max_day} is more than the additional limit ({1:add_max_day_times}).";
		errorMsg = StringUtils::Format(errorMsg, _ruleViolation.GetParam("act_max_day"), _ruleViolation.GetParam("add_max_day_times"));
	}
	int offsetTZMinute = StringUtils::stoi(_ruleViolation.GetParam("offsetTZMinute"), 0);
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("start"), 0) - offsetTZMinute * 60;
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("end"), 0) - offsetTZMinute * 60;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = _ruleViolation.GetParam("crew_id");
	rv->violation_msg = errorMsg;
	rv->idRule = _ruleParams[0].GetId();
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->description = _ruleParams[0].GetDescription();
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("ActualConseutiveTime", _ruleViolation.GetParam("act_max_day")));
	rv->operation_result.insert(pair<string, string>("MaxConseutiveTime", _ruleViolation.GetParam("add_max_day")));
	_ruleViolation.AddRuleViolations(rv);
}