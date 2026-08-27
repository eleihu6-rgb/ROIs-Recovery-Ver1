/**
 * @file CumulativeFtLimitForEvaFdRule.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckMaxConsecutiveDutyRuleForIt.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../period/WorkPeriod.h"
#include "../period/SlideWindow.h"
#include "TimezoneUtils.h"


bool CheckMaxConsecutiveDutyRuleForIt::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;

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
	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, _dbData->scenario.startDtUTC);
	//auto CrewBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	//老逻辑按照Pairing开始机场时区计算后续duty对应的本地时（非duty当地时间）
	auto zoneId = _dbData->getAirportZoneId(base);
	auto crewBaseOffsetMinutes = TimezoneUtils::GetTimezoneOffset(rosters[0]->getStartTimeUtcAct(), zoneId);
	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.SetParam("crew_id", crew->idCrew);
		_ruleViolation.SetRuleParam(ruleParam);
		_ruleViolation.SetParam("notAllowedDays", joinIntList(ruleParam._notAllowedDays, "|"));
		_ruleViolation.SetParam("notAllowedAssignments", joinStrList(ruleParam._notAllowedAssignments, "|"));
		_ruleViolation.SetParam("notAllowedAttributes", joinStrList(ruleParam._notAllowedAttributes, "|"));
		time_t dutyEndUtc = 0;
		vector<Duty*> dutyVec;
		bool isAllPreassiged = true;
		for (std::size_t i = 0; i < rosters.size(); i++)
		{

			if (rosters[i]->pairId)
			{
				long long  pgId = rosters[i]->pairId;

				//if (pgId == 12539522 || pgId == 12536490 || pgId == 12538539)
				//	printf("");

				vector<Duty*> dutys = rosters[i]->pairing->getDutyVec();
				for (std::size_t j = 0; j < dutys.size(); j++)
				{
					if (!ruleParam.MatchAssignments(*dutys[j], this->_dbData))
						continue;
					if ((dutys[j]->getStartTimeUtcAct() + crewBaseOffsetMinutes * 60) / (24 * 3600) - (dutyEndUtc + crewBaseOffsetMinutes * 60) / (24 * 3600) > 1)
					{
						if (dutyVec.size())
						{
							//检查是否全是预占
							if (!((this->_application == ROSTER_OPTIMIZER) && isAllPreassiged))
							{
								if (!CheckConsecutive(dutyVec, crewBaseOffsetMinutes, ruleParam))
								{
									_ruleViolation.SetParam("startUtc", to_string(dutyVec[0]->getStartTimeUtcAct()));
									_ruleViolation.SetParam("endUtc", to_string(dutyVec[dutyVec.size() - 1]->getEndTimeUtcAct()));
									ThrowRuleViolation();
								}
							}
						}
						dutyVec.clear();
						isAllPreassiged = true;

						dutyEndUtc = dutys[j]->getEndTimeUtcAct();
						// OP#2483 新增nextDayExtension 执勤超过这个值的 认为后一天也算飞行天
						if (ruleParam._nextDayExtension > 0) {
							string sta = TimeUtils::Format(dutys[j]->getEndTimeUtcAct() + crewBaseOffsetMinutes * 60, "HH:mm");
							int intSta = hhmmStrToMinutes(sta);
							int intNextDayExtension = ruleParam._nextDayExtension;
							if (intNextDayExtension < intSta) {
								dutyEndUtc = dutys[j]->getEndTimeUtcAct() + 24 * 3600;
							}
						}
						if (rosters[i]->source == "CR")
							isAllPreassiged = false;
						dutyVec.push_back(dutys[j]);
					}
					else {
						_dbData,
							dutyEndUtc = dutys[j]->getEndTimeUtcAct();
						// OP#2483 新增nextDayExtension 执勤超过这个值的 认为后一天也算飞行天
						if (ruleParam._nextDayExtension > 0) {
							string sta = TimeUtils::Format(dutys[j]->getEndTimeUtcAct() + crewBaseOffsetMinutes * 60, "HH:mm");
							int intSta = hhmmStrToMinutes(sta);
							int intNextDayExtension = ruleParam._nextDayExtension;
							if (intNextDayExtension < intSta) {
								dutyEndUtc = dutys[j]->getEndTimeUtcAct() + 24 * 3600;
							}
						}
						if (rosters[i]->source == "CR")
							isAllPreassiged = false;
						dutyVec.push_back(dutys[j]);

					}
				}
			}
			else {
				if (rosters[i]->isMergeFdpWithFly) {
					if ((rosters[i]->getRestStartUtcAct() + crewBaseOffsetMinutes * 60) / (24 * 3600) - (dutyEndUtc + crewBaseOffsetMinutes * 60) / (24 * 3600) > 1) {

						if (dutyVec.size()) {
							//检查是否全是预占
							if (!((this->_application == ROSTER_OPTIMIZER) && isAllPreassiged))
							{
								if (!CheckConsecutive(dutyVec, crewBaseOffsetMinutes, ruleParam)) {
									_ruleViolation.SetParam("startUtc", to_string(dutyVec[0]->getStartTimeUtcAct()));
									_ruleViolation.SetParam("endUtc", to_string(dutyVec[dutyVec.size() - 1]->getEndTimeUtcAct()));
									
									ThrowRuleViolation();
								}
							}
						}
						dutyVec.clear();
						isAllPreassiged = true;

						Duty* d = new Duty();
						d->setStartTimeUtcAct(rosters[i]->getStartTimeUtcAct());
						d->setEndTimeUtcAct(rosters[i]->getRestStartUtcAct());
						d->setDepStation(rosters[i]->getBase());
						dutyEndUtc = rosters[i]->getRestStartUtcAct();
						// OP#2483 新增nextDayExtension 执勤超过这个值的 认为后一天也算飞行天
						if (ruleParam._nextDayExtension > 0) {
							string sta = TimeUtils::Format(rosters[i]->getRestStartUtcAct() + crewBaseOffsetMinutes * 60, "HH:mm");
							int intSta = hhmmStrToMinutes(sta);
							int intNextDayExtension = ruleParam._nextDayExtension;
							if (intNextDayExtension < intSta) {
								dutyEndUtc = rosters[i]->getRestStartUtcAct() + 24 * 3600;
							}
						}
						if (rosters[i]->source == "CR")
							isAllPreassiged = false;
						dutyVec.push_back(d);

					}
					else {
						Duty* d = new Duty();
						d->setStartTimeUtcAct(rosters[i]->getStartTimeUtcAct());
						d->setEndTimeUtcAct(rosters[i]->getRestStartUtcAct());
						d->setDepStation(rosters[i]->getBase());

						dutyEndUtc = rosters[i]->getRestStartUtcAct();
						// OP#2483 新增nextDayExtension 执勤超过这个值的 认为后一天也算飞行天
						if (ruleParam._nextDayExtension > 0) {
							string sta = TimeUtils::Format(rosters[i]->getRestStartUtcAct() + crewBaseOffsetMinutes * 60, "HH:mm");
							int intSta = hhmmStrToMinutes(sta);
							int intNextDayExtension = ruleParam._nextDayExtension;
							if (intNextDayExtension < intSta) {
								dutyEndUtc = rosters[i]->getRestStartUtcAct() + 24 * 3600;
							}
						}
						if (rosters[i]->source == "CR")
							isAllPreassiged = false;
						dutyVec.push_back(d);
					}
				}
			}

		}
		if (dutyVec.size()) {

			//if (crew->idCrew == "0000077706")
			//	printf("");

			//检查是否全是预占
			if (!((this->_application == ROSTER_OPTIMIZER) && isAllPreassiged))
			{
				if (!CheckConsecutive(dutyVec, crewBaseOffsetMinutes, ruleParam)) {
					_ruleViolation.SetParam("startUtc", to_string(dutyVec[0]->getStartTimeUtcAct()));
					_ruleViolation.SetParam("endUtc", to_string(dutyVec[dutyVec.size() - 1]->getEndTimeUtcAct()));
					ThrowRuleViolation();
				}
			}
		}
	}
		
	
	return passAllRule;
}

bool CheckMaxConsecutiveDutyRuleForIt::CheckConsecutive(const std::vector<Duty*>& dutys, int offsetMinutes, const CheckMaxConsecutiveDutyRuleParamForIt& ruleParam) const {
	

	//计算1970-1-1开始目标日期对应的天数，方便日期比较和计算
	int timeStartDay = static_cast<int>((dutys[0]->getStartTimeUtcAct() + offsetMinutes * 60) / (24 * 3600));
	int timeEndDay = static_cast<int>((dutys[dutys.size() - 1]->getEndTimeUtcAct() + offsetMinutes * 60) / (24 * 3600)) + 1;

	/*
	在RO和监控阶段，如果一个任务环本身就超过长度限制，无需阻止RO分配该任务环，但是在Editor继续提示用户
	20221230 12505187
	*/
	//if ((dutys[0]->getPairingId() == dutys[dutys.size() - 1]->getPairingId()))
	if ((dutys[0]->getPairingId() == dutys[dutys.size() - 1]->getPairingId()) && (this->_application == ROSTER_OPTIMIZER))
		return true;

	//若总天数低于conseutiveTime，则无需检查
	//OP#2483 等于时，检查最后航班落地时间
	if (timeEndDay - timeStartDay < ruleParam._consecutiveDays) {
		return true;
	}


	if (ruleParam._notAllowedDays.empty())
		return true;

	bool isAllowed = true;
	for (const auto& day : ruleParam._notAllowedDays) {
		if (day > ruleParam._consecutiveDays || day < 0)
			continue;
		
		for (const auto& duty : dutys) {
			int dutyEndDay = (duty->getEndTimeUtcAct() + offsetMinutes * 60) / (24 * 3600) + 1;
			int dutyAtDay = dutyEndDay - timeStartDay;
			if (dutyAtDay == day) {
				if (ruleParam._notAllowedAssignments.size() > 0 && ruleParam._notAllowedAssignments[0] != "*" && !ruleParam._notAllowedAssignments[0].empty()
					&& find(ruleParam._notAllowedAssignments.begin(), ruleParam._notAllowedAssignments.end(), duty->getAssignment()) != ruleParam._notAllowedAssignments.end()) {
					isAllowed = false;
					break;
				}
				if (ruleParam._notAllowedAttributes.size() > 0 && ruleParam._notAllowedAttributes[0] != "*" && !ruleParam._notAllowedAttributes[0].empty()) {
					const auto& pairing = this->GetDataContext()->pairingIdMap[duty->getPairingId()];
					for (const auto& attribute : ruleParam._notAllowedAttributes) {
						if (pairing->getAttribute().find(attribute) != string::npos) {
							isAllowed = false;
							break;
						}
					}
				}
			}
			if (!isAllowed)
				break;
		}
		if (!isAllowed)
			break;
	}

	return isAllowed;

}

void CheckMaxConsecutiveDutyRuleForIt::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMaxConsecutiveDutyRuleParamForIt(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}

void CheckMaxConsecutiveDutyRuleForIt::ThrowRuleViolation() const {
	time_t startUtc = StringUtils::stoi(_ruleViolation.GetParam("startUtc"), 0);
	time_t endUtc = StringUtils::stoi(_ruleViolation.GetParam("endUtc"), 0);
	string crewId = _ruleViolation.GetParam("crew_id");
	string maxConsecutiveDay = _ruleViolation.GetParam("maxConsecutiveDay");
	string notAllowedDays = _ruleViolation.GetParam("notAllowedDays");
	string notAllowedAssignments = _ruleViolation.GetParam("notAllowedAssignments");
	string notAllowedAttributes = _ruleViolation.GetParam("notAllowedAttributes");

	string errorMsg = "It's not allowed have the duty(Assignments={0:notAllowedAssignments}, Attributes={1:notAllowedAttributes}) at the day({2:notAllowedDays}).";
	errorMsg = StringUtils::Format(errorMsg, notAllowedAssignments, notAllowedAttributes, notAllowedDays);

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, errorMsg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = crewId;
	rv->startDTUtc = startUtc;
	rv->endDTUtc = endUtc;
	rv->violation_msg = errorMsg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	_ruleViolation.AddRuleViolations(rv);
}