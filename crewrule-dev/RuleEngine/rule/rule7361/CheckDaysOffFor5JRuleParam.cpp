/**
 * @file CheckDaysOffFor5JRuleParam.cpp
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include <algorithm>
#include "UtilFunc.h"
#include "spdlog/spdlog.h"
#include "CheckDaysOffFor5JRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

using namespace std;

void CheckDaysOffFor5JRuleParam::ParseParam(const std::string& paramString) {
	assert(false);
}

void CheckDaysOffFor5JRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	if (dbRule.tableNum == 1) {
		_definitionParams.emplace_back(CheckDaysOffDefinitionFor5JRuleParam(this->GetRule()));
		auto& newParam = _definitionParams.back();
		newParam.ParseParam(dbRule);
	}
	else {
		_secondCaseParams.emplace_back(CheckDaysOffFor5JSecondRuleParam(this->GetRule()));
		auto& newParam = _secondCaseParams.back();
		newParam.ParseParam(dbRule);
	}
}

bool CheckDaysOffFor5JRuleParam::Empty() const {
	return _definitionParams.empty()
		&& _secondCaseParams.empty();

}

std::vector<std::unique_ptr<RestPeriod>> CheckDaysOffFor5JRuleParam::GetRestPeriods(const std::vector<const ROSTER*>& rosters, const string base, const time_t checkStart, const time_t checkEnd, const std::shared_ptr<CrewDataContext>& dbData) const {
	std::vector<std::unique_ptr<RestPeriod>> restPeriods;

	if (_definitionParams.empty() || rosters.empty())
		return restPeriods;

	// 默认定义规则中Include Blank Day等设置一样
	bool isCountBlankDay = _definitionParams[0]._includeBlankDay == "Y";
	bool isUltilizeLayover = _definitionParams[0]._includeLayoverRest == "Y";
	bool isUtilizePostDutyRest = _definitionParams[0]._includePairingBaseRest == "Y";
	string homeBase = _definitionParams[0]._homeBase;

	time_t prevRestEndTimeUtc = -1;//记录restPeriods中最后一个休息的结束时间（UTC)
	const ROSTER* prevRoster = nullptr;
	for (std::vector<const ROSTER*>::const_iterator rosterIter = rosters.begin(); rosterIter != rosters.end(); ++rosterIter)
	{
		Pairing* pg = (*rosterIter)->pairing;
		const ROSTER* currRoster = (*rosterIter);
		//二个Roster之间(一个Pairing对应一个Roster，因此可以理解为二个Pairing之间)休息
		if (prevRoster == nullptr) {
			//所有Roster列表中的第一个Pairing前面（也可能第一个是地面任务）的休息期

			//第一个Roster之前认为没有排班（即空白天）
			if (isCountBlankDay) {
				std::unique_ptr<RestPeriod> restPeriod = std::make_unique<RestPeriod>();
				restPeriod->SetStartTimeUTC(0);
				restPeriod->SetEndTimeUTC(currRoster->actStrUtc);

				restPeriod->SetStartTimeLoc(0);
				restPeriod->SetEndTimeLoc(currRoster->actStrLoc);

				if (currRoster->source == "PA") {
					restPeriod->SetSource(RosterSource::PA);
				}
				for (const auto& definitionRuleParam : _definitionParams) {
					if (definitionRuleParam.MatchDaysOff(0, currRoster->actStrLoc)) {
						prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
						restPeriods.push_back(std::move(restPeriod));
						break;
					}
				}
				
			}
		}
		else
		{
			//Roster间休息期
			if (isCountBlankDay) {

				time_t startTimeUtc = GetWorkEndTimeUTCForRoster(prevRoster, isUtilizePostDutyRest, base, homeBase);
				time_t endTimeUtc = currRoster->pairing == nullptr ? currRoster->getStartTimeUtcAct() : currRoster->pairing->getStartTimeUtcAct();

				time_t startTimeLoc = GetWorkEndTimeLocForRoster(prevRoster, isUtilizePostDutyRest, base, homeBase);
				time_t endTimeLoc = currRoster->pairing == nullptr ? currRoster->getStartTimeLocAct() : currRoster->pairing->getStartTimeLocAct();

				bool successMerge = false;
				if (RestPeriod::IsConsecutiveTime(prevRestEndTimeUtc, startTimeUtc)) {
					//合并Rest
					std::unique_ptr<RestPeriod>& restPeriod = restPeriods.at(restPeriods.size() - 1);
					restPeriod->SetEndTimeUTC(endTimeUtc);
					restPeriod->SetEndTimeLoc(endTimeLoc);
					if (currRoster->source == "PA") {
						restPeriod->SetSource(RosterSource::PA);
					}
					prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
					successMerge = true;
				}


				if (!successMerge && !RestPeriod::IsConsecutiveTime(startTimeUtc, endTimeUtc)) {
					//空白天计入休息
					std::unique_ptr<RestPeriod> restPeriod = std::make_unique<RestPeriod>();
					restPeriod->SetStartTimeUTC(startTimeUtc);
					restPeriod->SetEndTimeUTC(endTimeUtc);

					restPeriod->SetStartTimeLoc(startTimeLoc);
					restPeriod->SetEndTimeLoc(endTimeLoc);

					if (prevRoster->source == "PA" && currRoster->source == "PA") {
						restPeriod->SetSource(RosterSource::PA);
					}

					for (const auto& definitionRuleParam : _definitionParams) {
						if (definitionRuleParam.MatchDaysOff(restPeriod->GetStartTimeLoc(), restPeriod->GetEndTimeLoc())) {
							prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
							restPeriods.push_back(std::move(restPeriod));
							break;
						}
					}
				}

			}
			else {
				//空白天不计入休息
				std::unique_ptr<RestPeriod> restPeriod = std::make_unique<RestPeriod>();
				restPeriod->SetStartTimeUTC(GetWorkEndTimeUTCForRoster(prevRoster, isUtilizePostDutyRest, base, homeBase));
				restPeriod->SetEndTimeUTC(GetWorkEndTimeUTCForRoster(currRoster, false, base, homeBase));

				restPeriod->SetStartTimeLoc(GetWorkEndTimeLocForRoster(prevRoster, isUtilizePostDutyRest, base, homeBase));
				restPeriod->SetEndTimeLoc(GetWorkEndTimeLocForRoster(currRoster, false, base, homeBase));

				if (prevRoster->source == "PA" && currRoster->source == "PA") {
					restPeriod->SetSource(RosterSource::PA);
				}
				
				for (const auto& definitionRuleParam : _definitionParams) {
					if (definitionRuleParam.MatchDaysOff(restPeriod->GetStartTimeLoc(), restPeriod->GetEndTimeLoc())) {
						prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
						restPeriods.push_back(std::move(restPeriod));
						break;
					}
				}
			}
		}

		if (pg == nullptr)
		{
			for (const auto& definitionRuleParam : _definitionParams) {
				//判断roster是否是休息ROSTER
				//地面任务,内部存在休息因此直接退出。
				if (definitionRuleParam.MatchDoAssignment(currRoster)) {

					if (IsConsecutiveRest(prevRestEndTimeUtc, currRoster)) {
						//合并Rest
						std::unique_ptr<RestPeriod>& restPeriod = restPeriods.at(restPeriods.size() - 1);
						restPeriod->SetEndTimeUTC(currRoster->actEndUtc);
						restPeriod->SetEndTimeLoc(currRoster->actEndLoc);
						if (currRoster->source == "PA") {
							restPeriod->SetSource(RosterSource::PA);
						}
						prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
					}
					else {
						std::unique_ptr<RestPeriod> restPeriod = std::make_unique<RestPeriod>();
						restPeriod->SetStartTimeUTC(currRoster->actStrUtc);
						restPeriod->SetEndTimeUTC(currRoster->actEndUtc);

						restPeriod->SetStartTimeLoc(currRoster->actStrLoc);
						restPeriod->SetEndTimeLoc(currRoster->actEndLoc);

						if (currRoster->source == "PA") {
							restPeriod->SetSource(RosterSource::PA);
						}
						
						prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
						if (definitionRuleParam.MatchDaysOff(restPeriod->GetStartTimeLoc(), restPeriod->GetEndTimeLoc())) {
							restPeriods.push_back(std::move(restPeriod));
							break;
						}
					}
				}
			}
			
			prevRoster = currRoster;
			continue;
		}

		//本Pairing内部休息（不包含最后一个Duty的休息）
		const vector<Duty*> dutys = pg->getDutyVec();
		Duty* prevDuty = nullptr;
		for (std::vector<Duty*>::const_iterator dutyIter = dutys.begin(); dutyIter != dutys.end(); ++dutyIter) {
			Duty* currDuty = (*dutyIter);
			for (const auto& definitionRuleParam : _definitionParams) {
				if (definitionRuleParam.MatchDoAssignment(currDuty))
				{
					if (IsConsecutiveRest(prevRestEndTimeUtc, currDuty)) {
						//合并Rest
						std::unique_ptr<RestPeriod>& restPeriod = restPeriods.at(restPeriods.size() - 1);
						restPeriod->SetEndTimeUTC(currDuty->getStartTimeUtcAct());
						restPeriod->SetEndTimeLoc(currDuty->getStartTimeLocAct());
						if (currRoster->source == "PA") {
							restPeriod->SetSource(RosterSource::PA);
						}
						prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
					}
					else {
						//本Pairing当前Duty是休息任务类型
						std::unique_ptr<RestPeriod> restPeriod = std::make_unique<RestPeriod>();
						//TODO 时间可能有问题 by hexd
						restPeriod->SetStartTimeUTC(prevDuty == nullptr ? currDuty->getStartTimeUtcAct() : (prevDuty->getEndTimeUtcAct() + prevDuty->getActualDropoffMin() * 60));
						restPeriod->SetEndTimeUTC(currDuty->getEndTimeUtcAct());

						restPeriod->SetStartTimeLoc(prevDuty == nullptr ? currDuty->getStartTimeLocAct() : (prevDuty->getEndTimeLocAct() + prevDuty->getActualDropoffMin() * 60));
						restPeriod->SetEndTimeLoc(currDuty->getEndTimeLocAct());

						if (currRoster->source == "PA") {
							restPeriod->SetSource(RosterSource::PA);
						}
						prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
						if (definitionRuleParam.MatchDaysOff(restPeriod->GetStartTimeLoc(), restPeriod->GetEndTimeLoc())) {
							restPeriods.push_back(std::move(restPeriod));
							break;
						}
					}
				}
				else {
					if (prevDuty != nullptr && isUltilizeLayover) {
						//本Pairing内二个Duty之间
						std::unique_ptr<RestPeriod> restPeriod = std::make_unique<RestPeriod>();
						restPeriod->SetStartTimeUTC(prevDuty->getEndTimeUtcAct() + prevDuty->getActualDropoffMin() * 60);
						restPeriod->SetEndTimeUTC(currDuty->getStartTimeUtcAct());

						restPeriod->SetStartTimeLoc(prevDuty->getEndTimeLocAct() + prevDuty->getActualDropoffMin() * 60);
						restPeriod->SetEndTimeLoc(currDuty->getStartTimeLocAct());

						if (currRoster->source == "PA") {
							restPeriod->SetSource(RosterSource::PA);
						}
						prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
						if (definitionRuleParam.MatchDaysOff(restPeriod->GetStartTimeLoc(), restPeriod->GetEndTimeLoc())) {
							restPeriods.push_back(std::move(restPeriod));
							break;
						}
					}
				}
			}
			
			prevDuty = currDuty;
		}

		prevRoster = currRoster;
	}

	//按开始时间排序
	std::stable_sort(restPeriods.begin(), restPeriods.end(),
		[](const std::unique_ptr<RestPeriod>& src, const std::unique_ptr<RestPeriod>& dest)->int {
			return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
		}
	);

	return restPeriods;

}

//Roster中结束时间（计入工作）
time_t CheckDaysOffFor5JRuleParam::GetWorkEndTimeUTCForRoster(const ROSTER* roster, const bool isUtilizePostDutyRest, const string base, const string homeBase) const {

	string arrv = roster->pairing ? roster->pairing->getEndArp() : roster->location;
	bool isBase = base == arrv;
	bool isCountHomeBase = homeBase == "*" || (isBase && homeBase == "Y") || (!isBase && homeBase == "N");
	//TODO by hexd 时间获取，可能有问题
	if (roster->pairing == nullptr) {
		
		return isUtilizePostDutyRest && isCountHomeBase ? roster->actRestStrUtc : roster->actEndUtc;
	}
	return isUtilizePostDutyRest ? roster->pairing->getEndTimeUtcAct() : roster->pairing->getEndTimeIncludingRestUtcAct();
}

//Roster中结束时间（计入工作）
time_t CheckDaysOffFor5JRuleParam::GetWorkEndTimeLocForRoster(const ROSTER* roster, const bool isUtilizePostDutyRest, const string base, const string homeBase) const {

	string arrv = roster->pairing ? roster->pairing->getEndArp() : roster->location;
	bool isBase = base == arrv;
	bool isCountHomeBase = homeBase == "*" || (isBase && homeBase == "Y") || (!isBase && homeBase == "N");

	//TODO by hexd 时间获取，可能有问题
	if (roster->pairing == nullptr) {
		return isUtilizePostDutyRest ? roster->actRestStrLoc : roster->actEndLoc;
	}
	return isUtilizePostDutyRest ? roster->pairing->getEndTimeLocAct() : roster->pairing->getEndTimeIncludingRestLocAct();
}

bool CheckDaysOffFor5JRuleParam::IsConsecutiveRest(const time_t prevRestEndTimeUtc, const ROSTER* currRoster) const {
	if (prevRestEndTimeUtc > 0 && RestPeriod::IsConsecutiveTime(prevRestEndTimeUtc, currRoster->actStrUtc)) //连续休息间隔差1分钟也认为连续
	{
		return true;
	}
	return false;
}

bool CheckDaysOffFor5JRuleParam::IsConsecutiveRest(const time_t prevRestEndTimeUtc, const Duty* currDuty) const {
	if (prevRestEndTimeUtc > 0 && RestPeriod::IsConsecutiveTime(prevRestEndTimeUtc, currDuty->getStartTimeUtcAct())) //连续休息间隔差1分钟也认为连续
	{
		return true;
	}
	return false;
}

string CheckDaysOffFor5JRuleParam::GetCheckPeriod() const {
	if (_definitionParams.empty())
		return "RP";

	return _definitionParams[0]._checkMode;
}