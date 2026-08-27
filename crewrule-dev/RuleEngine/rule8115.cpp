#include "RuleEngine.h"

#include "TimezoneUtils.h"
#include "Utility.h"

#include <ctime>
#include <algorithm>
#include <iostream>

#include "CrewDB.h"
#include "UtilFunc.h"
#include "UtilDbg.h"
#include "StringUtil.h"
#include "utils/DutyUtils.h"
#include "utils/StringUtils.h"

//8115 PO
bool LegalityChecker::checkMaxConsecutiveDuty_R6(vector<Duty *> duties) {

	if (duties.size() <= 1)
		return true;

	//老逻辑按照Pairing开始机场时区计算后续duty对应的本地时（非duty当地时间）
	//auto offsetMinutes = this->_dbData->getAirportOffsetMinutes(duties[0]->getDepStation());
	auto offsetMinutes = DutyUtils::GetTimeZoneOffsetByDep(*(duties[0]), _dbData);

	vector<Duty*> dutyVec;

	time_t dutyEndUtc = 0;

	for (const DBRule& singleRule : this->_dbData->getRuleFunctions(RULES::MAX_CONSECUTIVE_DUTY_DAYS_R6)) {
		rule8115* cache = (rule8115*)singleRule.parsedParam.get();

		string nextDayExtension = cache->nextDayExtension;
		for (std::size_t j = 0; j < duties.size(); j++) {
			if (find(cache->dutyAssignments.begin(), cache->dutyAssignments.end(), duties[j]->getAssignment()) == cache->dutyAssignments.end()) {
				continue;
			}
			if ((duties[j]->getFDPStartUtcTimes("ACT") + offsetMinutes * 60) / (24 * 3600) - (dutyEndUtc + offsetMinutes * 60) / (24 * 3600) > 1) {

				if (dutyVec.size()) {
					if (!check8115(dutyVec, singleRule, offsetMinutes)) {
						return false;
					}
				}
				dutyVec.clear();

				dutyEndUtc = duties[j]->getFDPEndUtcTimes("ACT");
				// OP#2483 新增nextDayExtension 执勤超过这个值的 认为后一天也算飞行天
				if (!nextDayExtension.empty()) {
					string sta = utcToUtcHHMM(duties[j]->getFDPEndUtcTimes("ACT") + offsetMinutes * 60);
					int intSta = atoi(sta.c_str());
					int intNextDayExtension = hhmmStrToHHmmInt(nextDayExtension);
					if (intNextDayExtension < intSta) {
						dutyEndUtc = duties[j]->getFDPEndUtcTimes("ACT") + 24 * 3600;
					}
				}
				dutyVec.push_back(duties[j]);
			}
			else {

				dutyEndUtc = duties[j]->getFDPEndUtcTimes("ACT");
				// OP#2483 新增nextDayExtension 执勤超过这个值的 认为后一天也算飞行天
				if (!nextDayExtension.empty()) {
					string sta = utcToUtcHHMM(duties[j]->getFDPEndUtcTimes("ACT") + offsetMinutes * 60);
					int intSta = atoi(sta.c_str());
					int intNextDayExtension = hhmmStrToHHmmInt(nextDayExtension);
					if (intNextDayExtension < intSta) {
						dutyEndUtc = duties[j]->getFDPEndUtcTimes("ACT") + 24 * 3600;
					}
				}
				dutyVec.push_back(duties[j]);
			}
		}
		if (dutyVec.size()) {
			if (!check8115(dutyVec, singleRule, offsetMinutes))
			{
				return false;
			}
		}
	}
	return true;
}

//按crew检查
bool LegalityChecker::checkMaxConsecutiveDuty_R6(RULE_LEGALITY * pCrew) {
	bool isValid = true;
	if (!pCrew) {
		return true;
	}
	//20200908 ain, mantis#8742, RO不再跳过rule 8115
	if (this->GetApplication() == PAIRING_OPTIMIZER) {
		return true;
	}
	shared_ptr<CREW>& crew = _dbData->crewList[pCrew->crewIndex];
	if (!crew || crew->rosterList.empty()) {
		return true;
	}
	const vector<DBRule>& dutyBuilder = this->_dbData->getRuleFunctions(RULES::MAX_CONSECUTIVE_DUTY_DAYS_R6);
	if (dutyBuilder.size() == 0) {
		return true;
	}
	vector<SharedPtr<ROSTER>>& rosters = crew->rosterList;
	string base = Utility::GetInstancePtr()->getCrewPrimaryBase(crew->baseList, _dbData->scenario.startDtUTC);
	//auto CrewBaseOffsetMinutes = this->_dbData->getAirportOffsetMinutes(base);
	//老逻辑按照Pairing开始机场时区计算后续duty对应的本地时（非duty当地时间）
	auto zoneId = _dbData->getAirportZoneId(base);
	auto crewBaseOffsetMinutes = TimezoneUtils::GetTimezoneOffset(rosters[0]->getStartTimeUtcAct(), zoneId);

	for (const auto& rule : dutyBuilder) {
		time_t dutyEndUtc = 0;
		vector<Duty*> dutyVec;

		rule8115* cache = (rule8115*)rule.parsedParam.get();
		time_t lCheckedStart = rosters[0]->getStartTimeUtcAct(), lCheckedEnd = rosters[rosters.size() - 1]->getRestStartUtcAct();
		if (!Utility::GetInstancePtr()->isCrewQualified(crew, cache->base, cache->rank, cache->fleet, "*", "*", lCheckedStart, lCheckedEnd)) {
			return true;
		}
		string nextDayExtension = cache->nextDayExtension;

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
					if (find(cache->dutyAssignments.begin(), cache->dutyAssignments.end(), dutys[j]->getAssignment()) == cache->dutyAssignments.end()) {
						continue;
					}
					if ((dutys[j]->getFDPStartUtcTimes("ACT") + crewBaseOffsetMinutes * 60) / (24 * 3600) - (dutyEndUtc + crewBaseOffsetMinutes * 60) / (24 * 3600) > 1)
					{
						if (dutyVec.size())
						{
							//检查是否全是预占
							if (!((this->GetApplication() == ROSTER_OPTIMIZER) && isAllPreassiged))
							{
								if (!check8115(dutyVec, rule, crewBaseOffsetMinutes, crew))
								{
									isValid = false;
									pCrew->isLegal = false;
								}
							}
						}
						dutyVec.clear();
						isAllPreassiged = true;

						dutyEndUtc = dutys[j]->getFDPEndUtcTimes("ACT");
						// OP#2483 新增nextDayExtension 执勤超过这个值的 认为后一天也算飞行天
						if (!nextDayExtension.empty()) {
							string sta = utcToUtcHHMM(dutys[j]->getFDPEndUtcTimes("ACT") + crewBaseOffsetMinutes * 60);
							int intSta = atoi(sta.c_str());
							int intNextDayExtension = hhmmStrToHHmmInt(nextDayExtension);
							if (intNextDayExtension < intSta) {
								dutyEndUtc = dutys[j]->getFDPEndUtcTimes("ACT") + 24 * 3600;
							}
						}
						if (rosters[i]->source == "CR")
							isAllPreassiged = false;
						dutyVec.push_back(dutys[j]);
					}
					else {_dbData, 
						dutyEndUtc = dutys[j]->getFDPEndUtcTimes("ACT");
						// OP#2483 新增nextDayExtension 执勤超过这个值的 认为后一天也算飞行天
						if (!nextDayExtension.empty()) {
							string sta = utcToUtcHHMM(dutys[j]->getFDPEndUtcTimes("ACT") + crewBaseOffsetMinutes * 60);
							int intSta = atoi(sta.c_str());
							int intNextDayExtension = hhmmStrToHHmmInt(nextDayExtension);
							if (intNextDayExtension < intSta) {
								dutyEndUtc = dutys[j]->getFDPEndUtcTimes("ACT") + 24 * 3600;
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
							if (!((this->GetApplication() == ROSTER_OPTIMIZER) && isAllPreassiged))
							{
								if (!check8115(dutyVec, rule, crewBaseOffsetMinutes, crew)) {
									isValid = false;
									pCrew->isLegal = false;
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
						if (!nextDayExtension.empty()) {
							string sta = utcToUtcHHMM(rosters[i]->getRestStartUtcAct() + crewBaseOffsetMinutes * 60);
							int intSta = atoi(sta.c_str());
							int intNextDayExtension = hhmmStrToHHmmInt(nextDayExtension);
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
						if (!nextDayExtension.empty()) {
							string sta = utcToUtcHHMM(rosters[i]->getRestStartUtcAct() + crewBaseOffsetMinutes * 60);
							int intSta = atoi(sta.c_str());
							int intNextDayExtension = hhmmStrToHHmmInt(nextDayExtension);
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
			if (!((this->GetApplication() == ROSTER_OPTIMIZER) && isAllPreassiged))
			{
				if (!check8115(dutyVec, rule, crewBaseOffsetMinutes, crew)) {
					isValid = false;
					pCrew->isLegal = false;
				}
			}
		}
	}
	return isValid;
}

bool LegalityChecker::check8115(vector<Duty*>& dutys, const DBRule& rule, int offsetMinutes, shared_ptr<CREW> crew) {
	rule8115* cache = (rule8115*)rule.parsedParam.get();
	string crewId = crew ? crew->idCrew : "";

	//if (crewId == "0000011618" && dutys[0]->getPairingId() == 12633469)
	//{
	//	printf("");
	//}

	//计算1970-1-1开始目标日期对应的天数，方便日期比较和计算
	int timeStartDay = static_cast<int>((dutys[0]->getFDPStartUtcTimes("ACT") + offsetMinutes * 60) / (24 * 3600));
	int timeEndDay = static_cast<int>((dutys[dutys.size() - 1]->getFDPEndUtcTimes("ACT") + offsetMinutes * 60) / (24 * 3600)) + 1;

	//if ((dutys[dutys.size() - 1]->getFDPOrEndUtcTimes("ACT") + offsetMinutes * 60) % (24 * 3600)) {
	//	timeEndDay++;
	//}
	int unit = 0;
	if (cache->Unit == "CD") {
		unit = 1;
	}
	/*
	在RO和监控阶段，如果一个任务环本身就超过长度限制，无需阻止RO分配该任务环，但是在Editor继续提示用户
	20221230 12505187
	*/
	//if ((dutys[0]->getPairingId() == dutys[dutys.size() - 1]->getPairingId()))
	if ((dutys[0]->getPairingId() == dutys[dutys.size() - 1]->getPairingId()) && (this->GetApplication() == ROSTER_OPTIMIZER))
		return true;

	//若总天数低于maxConseutiveTime，则无需检查
	//OP#2483 等于时，检查最后航班落地时间
	if (timeEndDay - timeStartDay < cache->maxConseutiveTime*unit) {
		return true;
	}
	//若比最大vradd限制时间长，则直接告警
	if (timeEndDay - timeStartDay > cache->vrAddMaxConseutiveTime*unit)
	{
		if (this->GetApplication() == PAIRING_OPTIMIZER)
			return false;
		if (this->GetApplication() == ROSTER_OPTIMIZER)
			return false;
		string errorMsg = "The actual consecutive flying days ({0:actualConsecutiveFlyingDays}) exceeds the maximum allowed consecutive flying days ({1:maxConsecutiveTime}).";
		errorMsg = StringUtils::Format(errorMsg, (timeEndDay - timeStartDay), cache->maxConseutiveTime);

		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->crewId = crewId;
		rv->pairingId = dutys[0]->getPairingId();
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
		rv->startDTUtc = dutys[0]->getFDPStartUtcTimes("ACT");
		rv->endDTUtc = dutys[dutys.size() - 1]->getFDPEndUtcTimes("ACT");
		rv->violation_msg = errorMsg;
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
		rv->operation_result.insert(pair<string, string>("ActualConseutiveTime", Utility::GetInstancePtr()->ToString(timeEndDay - timeStartDay)));
		rv->operation_result.insert(pair<string, string>("MaxConseutiveTime", Utility::GetInstancePtr()->ToString(cache->vrAddMaxConseutiveTime)));
		this->addRuleViolations(rv, &rule);
		return false;
	}
	//若总天数在maxConseutiveTime，vrAddMaxConseutiveTime之间，且存在时区差别超过6h，则合规
	//若总天数在maxConseutiveTime，vrAddMaxConseutiveTime之间，且超出maxConseutiveTime的日期存在非返航备降(VR)则违规
	for (std::size_t i = 0; i < dutys.size(); i++)
	{
		int dKeyDay = static_cast<int>((dutys[i]->getFDPEndUtcTimes("ACT") + offsetMinutes * 60) / (24 * 3600)) - timeStartDay + 1;
		if (dKeyDay >= 0 && dKeyDay < cache->maxConseutiveTime)
		{
			//if (TimezoneUtils::abs(this->_dbData->getAirportOffsetMinutes(dutys[i]->getDepStation()) - offsetMinutes) / 60.0 >= cache->maxTimezoneGap) 
			if (TimezoneUtils::abs(DutyUtils::GetTimeZoneOffsetByDep(*dutys[i], _dbData) - offsetMinutes) / 60.0 >= cache->maxTimezoneGap)
			{
				return true;
			}
		}
		if (dKeyDay > cache->maxConseutiveTime && dKeyDay <= cache->vrAddMaxConseutiveTime)
		{
			auto seg = dutys[i]->getLastSegment();
			if (!seg || !seg->getIsVrAdd() || (seg->getFltSts() != "V" && seg->getFltSts() != "R"))
			{
				if (this->GetApplication() == PAIRING_OPTIMIZER)
					return false;
				if (this->GetApplication() == ROSTER_OPTIMIZER)
					return false;

				string errorMsg = "The actual consecutive flying days ({0:actualConsecutiveFlyingDays}) exceeds the maximum allowed consecutive flying days ({1:maxConsecutiveTime}).";
				errorMsg = StringUtils::Format(errorMsg, (timeEndDay - timeStartDay), cache->maxConseutiveTime);

				RULE_VIOLATION* rv = new RULE_VIOLATION();
				rv->crewId = crewId;
				rv->pairingId = dutys[0]->getPairingId();
				rv->type = VIOLATION_TYPE::CREW_VIOLATION;
				rv->startDTUtc = dutys[0]->getFDPStartUtcTimes("ACT");
				rv->endDTUtc = dutys[dutys.size() - 1]->getFDPEndUtcTimes("ACT");
				rv->violation_msg = errorMsg;
				rv->operation_result.insert(pair<string, string>("ActualConseutiveTime", Utility::GetInstancePtr()->ToString(timeEndDay - timeStartDay)));
				rv->operation_result.insert(pair<string, string>("MaxConseutiveTime", Utility::GetInstancePtr()->ToString(cache->maxConseutiveTime)));
				this->addRuleViolations(rv, &rule);
				return false;
			}

		}
	}

	// OP#2483
	// 比较落地时间的判断，用计划的天数
	int timeEndDaySch = static_cast<int>((dutys[dutys.size() - 1]->getFDPEndUtcTimes("ACT") + offsetMinutes * 60) / (24 * 3600)) + 1;

	//if ((dutys[dutys.size() - 1]->getFDPOrEndUtcTimes("ACT") + offsetMinutes * 60) % (24 * 3600)) {
	//	timeEndDaySch++;
	//}

	string lastDayMaxSta = cache->lastDayMaxSta;
	// 获取最后一天计算执勤期的segment的结束时间
	string sta = utcToUtcHHMM(dutys[dutys.size() - 1]->getFDPEndUtcTimes("ACT") + offsetMinutes * 60);
	int intSta = atoi(sta.c_str());
	int intLastDayMaxSta = hhmmStrToHHmmInt(lastDayMaxSta);

	int days = timeEndDaySch - timeStartDay;
	if (days == cache->maxConseutiveTime && intLastDayMaxSta < intSta) {

		if (this->GetApplication() == PAIRING_OPTIMIZER)
			return false;
		if (this->GetApplication() == ROSTER_OPTIMIZER)
			return false;
		string errorMsg = "The actual consecutive duty days ({0:actualConsecutiveFlyingDays}) has reached the maximum allowable consecutive duty day limit, and the ATA ({1:lastDaySta}) of the last flight exceeds the prescribed latest arrival time restriction ({2:lastDayMaxSta}).";
		errorMsg = StringUtils::Format(errorMsg, days, intSta, cache->lastDayMaxSta);
		RULE_VIOLATION* rv = new RULE_VIOLATION();
		rv->crewId = crewId;
		rv->pairingId = dutys[0]->getPairingId();
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
		rv->startDTUtc = dutys[0]->getFDPStartUtcTimes("ACT");
		rv->endDTUtc = dutys[dutys.size() - 1]->getFDPEndUtcTimes("ACT");
		rv->violation_msg = errorMsg;
		rv->operation_result.insert(pair<string, string>("ActualConseutiveTime", Utility::GetInstancePtr()->ToString(timeEndDay - timeStartDay)));
		rv->operation_result.insert(pair<string, string>("MaxConseutiveTime", Utility::GetInstancePtr()->ToString(cache->maxConseutiveTime)));
		rv->operation_result.insert(pair<string, string>("LastDayMaxSta", cache->lastDayMaxSta));
		this->addRuleViolations(rv, &rule);
		return false;
	}
	return true;
}


//20210713 ain, comment, 清理重复函数
/*
//bool LegalityChecker::check8115(vector<Duty *>& dutys, DBRule& rule,int offset) {
//	rule8115* cache = (rule8115*)rule.parsedParam.get();
//
//	int timeStartDay = (dutys[0]->getFDPStartUtcTimes("ACT") + offset * 3600) / (24 * 3600);
//	int timeEndDay = (dutys[dutys.size() - 1]->getFDPOrEndUtcTimes("ACT") + offset * 3600) / (24 * 3600);
//
//	if ((dutys[dutys.size() - 1]->getFDPOrEndUtcTimes("ACT") + offset * 3600) % (24 * 3600)) {
//		timeEndDay++;
//	}
//	int unit = 0;
//	if (cache->Unit == "CD") {
//		unit = 1;
//	}
//	if (timeEndDay - timeStartDay <= cache->maxConseutiveTime*unit) {
//		return true;
//	}
//	//比最大vradd限制时间长 直接告警
//	if (timeEndDay - timeStartDay > cache->vrAddMaxConseutiveTime*unit) {
//		stringstream ss;
//		ss << "Actual consecutive flying days: " << timeEndDay - timeStartDay;
//		ss << " is greater than Maximum consecutive flying days: " << cache->vrAddMaxConseutiveTime;
//		string errorMsg = ss.str();
//		RULE_VIOLATION* rv = new RULE_VIOLATION();
//		rv->pairingId = dutys[0]->getPairingId();
//		rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
//		rv->startDTUtc = dutys[0]->getFDPStartUtcTimes("ACT");
//		rv->endDTUtc = dutys[dutys.size() - 1]->getFDPOrEndUtcTimes("ACT");
//		rv->violation_msg = errorMsg;
//		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
//		rv->operation_result.insert(pair<string, string>("ActualConseutiveTime", Utility::GetInstancePtr()->ToString(timeEndDay - timeStartDay)));
//		rv->operation_result.insert(pair<string, string>("MaxConseutiveTime", Utility::GetInstancePtr()->ToString(cache->vrAddMaxConseutiveTime)));
//		this->addRuleViolations(rv, &rule);
//		return false;
//	}
//	for (std::size_t i = 0; i < dutys.size(); i++) {
//		int dKeyDay = (dutys[i]->getFDPOrEndUtcTimes("ACT") + offset * 3600) / (24 * 3600) - timeStartDay + 1;
//		if (dKeyDay >= 0 && dKeyDay < cache->maxConseutiveTime) {
//			if (TimezoneUtils::abs(this->_dbData->getAirportOffset(dutys[i]->getDepStation()) - offset) >= cache->maxTimezoneGap) {
//				return true;
//			}
//		}
//		if (dKeyDay > cache->maxConseutiveTime && dKeyDay <= cache->vrAddMaxConseutiveTime) {
//			auto seg = dutys[i]->getLastSegment();
//			if (!seg->getIsVrAdd() || (seg->getFltSts() != "V" && seg->getFltSts() != "R")) {
//				stringstream ss;
//				ss << "Actual consecutive flying days: " << (timeEndDay - timeStartDay)
//					<< " is greater than Maximum consecutive flying days: " << cache->maxConseutiveTime;
//				string errorMsg = ss.str();
//				RULE_VIOLATION* rv = new RULE_VIOLATION();
//				rv->pairingId = dutys[0]->getPairingId();
//				rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
//				rv->startDTUtc = dutys[0]->getFDPStartUtcTimes("ACT");
//				rv->endDTUtc = dutys[dutys.size() - 1]->getFDPOrEndUtcTimes("ACT");
//				rv->violation_msg = errorMsg;
//				rv->operation_result.insert(pair<string, string>("ActualConseutiveTime", Utility::GetInstancePtr()->ToString(timeEndDay - timeStartDay)));
//				rv->operation_result.insert(pair<string, string>("MaxConseutiveTime", Utility::GetInstancePtr()->ToString(cache->maxConseutiveTime)));
//				this->addRuleViolations(rv, &rule);
//				return false;
//			}
//		}
//	}
//	return true;
//}
*/