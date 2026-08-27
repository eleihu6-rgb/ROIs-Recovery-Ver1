#include "RestPeriod.h"

#include <algorithm>
#include "RuleParams.h"
#include "../constant/Constants.h"

std::vector<std::unique_ptr<RestPeriod>> RestPeriod::GetRestPeriods(const std::vector<const ROSTER*>& rosters,
	const std::vector<std::string>& dayOffAssignmentGroups, const bool isUtilizePostDutyRest,
	const bool isUltilizeLayover, const bool isCountBlankDay,
	const std::shared_ptr<CrewDataContext>& dbData, const bool isMerge) {

	std::vector<std::unique_ptr<RestPeriod>> restPeriods;

	if (rosters.empty()) {
		return restPeriods;
	}

	int accStateTimeZone = static_cast<int>((rosters.front()->getStartTimeLocSch() - rosters.front()->getStartTimeUtcSch()) / 60); //适应状态时区(分钟数)
	time_t prevRestEndTimeUtc = -1;//记录restPeriods中最后一个休息的结束时间（UTC)
	const ROSTER* prevRoster = nullptr;
	for (std::vector<const ROSTER*>::const_iterator rosterIter = rosters.begin(); rosterIter != rosters.end(); ++rosterIter)
	{
		Pairing * pg = (*rosterIter)->pairing;
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

				restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

				prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
				restPeriods.push_back(std::move(restPeriod));
			}
		}
		else 
		{
			//Roster间休息期
			if (isCountBlankDay) {

				time_t startTimeUtc = GetWorkEndTimeUTCForRoster(prevRoster, isUtilizePostDutyRest);
				time_t endTimeUtc = GetWorkStartTimeUTCForRoster(currRoster);

				time_t startTimeLoc = GetWorkEndTimeLocForRoster(prevRoster, isUtilizePostDutyRest);
				time_t endTimeLoc = GetWorkStartTimeLocForRoster(currRoster);

				bool successMerge = false;
				if (isMerge && RestPeriod::IsConsecutiveTime(prevRestEndTimeUtc, startTimeUtc)) {
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

					restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

					prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();

					restPeriods.push_back(std::move(restPeriod));
				}

			}
			else {
				//空白天不计入休息
				std::unique_ptr<RestPeriod> restPeriod = std::make_unique<RestPeriod>();
				restPeriod->SetStartTimeUTC(GetWorkEndTimeUTCForRoster(prevRoster, isUtilizePostDutyRest));
				restPeriod->SetEndTimeUTC(GetWorkEndTimeUTCForRoster(currRoster, false));

				restPeriod->SetStartTimeLoc(GetWorkEndTimeLocForRoster(prevRoster, isUtilizePostDutyRest));
				restPeriod->SetEndTimeLoc(GetWorkEndTimeLocForRoster(currRoster, false));

				if (prevRoster->source == "PA" && currRoster->source == "PA") {
					restPeriod->SetSource(RosterSource::PA);
				}

				restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

				prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
				restPeriods.push_back(std::move(restPeriod));
			}
		}

		if (pg == nullptr)
		{
			//判断roster是否是休息ROSTER
			//地面任务,内部存在休息因此直接退出。
			if (MatchDayOffAssignment(currRoster->qualifier, dayOffAssignmentGroups, dbData)) {

				if (isMerge && RestPeriod::IsConsecutiveRest(prevRestEndTimeUtc, currRoster)) {
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

					restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

					prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
					restPeriods.push_back(std::move(restPeriod));
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
			if (MatchDayOffAssignment(currDuty->getAssignment(), dayOffAssignmentGroups, dbData))
			{
				if (isMerge && RestPeriod::IsConsecutiveRest(prevRestEndTimeUtc, currDuty)) {
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
					restPeriod->SetStartTimeUTC(prevDuty == nullptr ? currDuty->getStartTimeUtcAct() : (prevDuty->getEndTimeUtcAct() + prevDuty ->getActualDropoffMin() * 60));
					restPeriod->SetEndTimeUTC(currDuty->getEndTimeUtcAct());

					restPeriod->SetStartTimeLoc(prevDuty == nullptr ? currDuty->getStartTimeLocAct() : (prevDuty->getEndTimeLocAct() + prevDuty->getActualDropoffMin() * 60));
					restPeriod->SetEndTimeLoc(currDuty->getEndTimeLocAct());

					if (currRoster->source == "PA") {
						restPeriod->SetSource(RosterSource::PA);
					}

					if (prevDuty != nullptr) {
						accStateTimeZone = prevDuty->getRefTimeZone();
					}
					restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

					prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
					restPeriods.push_back(std::move(restPeriod));
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
					
					accStateTimeZone = prevDuty->getRefTimeZone();
					restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

					prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
					restPeriods.push_back(std::move(restPeriod));
				}
			}
			prevDuty = currDuty;
		}

		prevRoster = currRoster;
	}

	//最后一个Roster，计算休息期。不需要考虑，认为rest是0
	//const ROSTER* tailRoster = *(rosters.end() - 1);


	//按开始时间排序
	std::stable_sort(restPeriods.begin(), restPeriods.end(),
		[](const std::unique_ptr<RestPeriod>& src, const std::unique_ptr<RestPeriod>& dest)->int {
		return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
		}
	);

	return restPeriods;

}

std::vector<std::unique_ptr<RestPeriod>> RestPeriod::GetRestPeriods(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CrewDataContext>& dbData,
	const std::vector<std::string>& workingAssignmentGroups, const bool isCountBlankDay, const bool isUtilizePostDutyRest,
	const bool isUltilizeLayover, const bool isMerge) {

	std::vector<std::unique_ptr<RestPeriod>> restPeriods;

	if (rosters.empty()) {
		return restPeriods;
	}

	int accStateTimeZone = static_cast<int>((rosters.front()->getStartTimeLocSch() - rosters.front()->getStartTimeUtcSch()) / 60); //适应状态时区(分钟数)
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

				restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

				prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
				restPeriods.push_back(std::move(restPeriod));
			}
		}
		else
		{
			//Roster间休息期
			if (isCountBlankDay) {

				time_t startTimeUtc = GetWorkEndTimeUTCForRoster(prevRoster, isUtilizePostDutyRest);
				time_t endTimeUtc = GetWorkStartTimeUTCForRoster(currRoster);

				time_t startTimeLoc = GetWorkEndTimeLocForRoster(prevRoster, isUtilizePostDutyRest);
				time_t endTimeLoc = GetWorkStartTimeLocForRoster(currRoster);

				bool successMerge = false;
				if (isMerge && RestPeriod::IsConsecutiveTime(prevRestEndTimeUtc, startTimeUtc)) {
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

					restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

					prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();

					restPeriods.push_back(std::move(restPeriod));
				}

			}
			else {
				//空白天不计入休息
				std::unique_ptr<RestPeriod> restPeriod = std::make_unique<RestPeriod>();
				restPeriod->SetStartTimeUTC(GetWorkEndTimeUTCForRoster(prevRoster, isUtilizePostDutyRest));
				restPeriod->SetEndTimeUTC(GetWorkEndTimeUTCForRoster(currRoster, false));

				restPeriod->SetStartTimeLoc(GetWorkEndTimeLocForRoster(prevRoster, isUtilizePostDutyRest));
				restPeriod->SetEndTimeLoc(GetWorkEndTimeLocForRoster(currRoster, false));

				if (prevRoster->source == "PA" && currRoster->source == "PA") {
					restPeriod->SetSource(RosterSource::PA);
				}

				restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

				prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
				restPeriods.push_back(std::move(restPeriod));
			}
		}

		if (pg == nullptr)
		{
			//判断roster是否是休息ROSTER
			//地面任务,内部存在休息因此直接退出。
			if (!dbData->isAssignmentInGroup(currRoster->qualifier, workingAssignmentGroups)) {

				if (isMerge && RestPeriod::IsConsecutiveRest(prevRestEndTimeUtc, currRoster)) {
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

					restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

					prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
					restPeriods.push_back(std::move(restPeriod));
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
			if (!dbData->isAssignmentInGroup(currDuty->getAssignment(), workingAssignmentGroups))
			{
				if (isMerge && RestPeriod::IsConsecutiveRest(prevRestEndTimeUtc, currDuty)) {
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

					if (prevDuty != nullptr) {
						accStateTimeZone = prevDuty->getRefTimeZone();
                    }
					restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

					prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
					restPeriods.push_back(std::move(restPeriod));
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

					accStateTimeZone = prevDuty->getRefTimeZone();
					restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

					prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
					restPeriods.push_back(std::move(restPeriod));
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

std::vector<std::unique_ptr<RestPeriod>> RestPeriod::GetRestPeriods(const std::vector<const ROSTER*>& rosters,
	const bool isUtilizePostDutyRest, const bool isUltilizeLayover, const bool isCountBlankDay,
	const std::shared_ptr<CrewDataContext>& dbData, const bool isMerge) {

	std::vector<std::unique_ptr<RestPeriod>> restPeriods;

	if (rosters.empty()) {
		return restPeriods;
	}

	int accStateTimeZone = static_cast<int>((rosters.front()->getStartTimeLocSch() - rosters.front()->getStartTimeUtcSch()) / 60); //适应状态时区(分钟数)
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

				restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

				prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
				restPeriods.push_back(std::move(restPeriod));
			}
		}
		else
		{
			//Roster间休息期
			if (isCountBlankDay) {

				time_t startTimeUtc = GetWorkEndTimeUTCForRoster(prevRoster, isUtilizePostDutyRest);
				time_t endTimeUtc = GetWorkStartTimeUTCForRoster(currRoster);

				time_t startTimeLoc = GetWorkEndTimeLocForRoster(prevRoster, isUtilizePostDutyRest);
				time_t endTimeLoc = GetWorkStartTimeLocForRoster(currRoster);

				bool successMerge = false;
				if (isMerge && RestPeriod::IsConsecutiveTime(prevRestEndTimeUtc, startTimeUtc)) {
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

					restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

					if (prevRoster->source == "PA" && currRoster->source == "PA") {
						restPeriod->SetSource(RosterSource::PA);
					}
					prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();

					restPeriods.push_back(std::move(restPeriod));
				}

			}
			else {
				//空白天不计入休息
				std::unique_ptr<RestPeriod> restPeriod = std::make_unique<RestPeriod>();
				restPeriod->SetStartTimeUTC(GetWorkEndTimeUTCForRoster(prevRoster, isUtilizePostDutyRest));
				restPeriod->SetEndTimeUTC(GetWorkEndTimeUTCForRoster(currRoster, false));

				restPeriod->SetStartTimeLoc(GetWorkEndTimeLocForRoster(prevRoster, isUtilizePostDutyRest));
				restPeriod->SetEndTimeLoc(GetWorkEndTimeLocForRoster(currRoster, false));

				if (prevRoster->source == "PA" && currRoster->source == "PA") {
					restPeriod->SetSource(RosterSource::PA);
				}

				restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

				prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
				restPeriods.push_back(std::move(restPeriod));
			}
		}

		if (pg == nullptr)
		{
			//判断roster是否是休息ROSTER
			//地面任务,内部存在休息因此直接退出。
			
			if (RuleParams::GetInstancePtr()->isRestAssignment(currRoster->qualifier, currRoster->duty)) {
				if (isMerge && RestPeriod::IsConsecutiveRest(prevRestEndTimeUtc, currRoster)) {
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

					restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

					prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
					restPeriods.push_back(std::move(restPeriod));
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
			if (RuleParams::GetInstancePtr()->isRestAssignment(currDuty->getAssignment(), ""))
			{
				if (isMerge && RestPeriod::IsConsecutiveRest(prevRestEndTimeUtc, currDuty)) {
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

					if (prevDuty != nullptr) {
						accStateTimeZone = prevDuty->getRefTimeZone();
					}
					restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

					prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
					restPeriods.push_back(std::move(restPeriod));
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

					accStateTimeZone = prevDuty->getRefTimeZone();
					restPeriod->SetAccTimezoneAtStart(accStateTimeZone);

					prevRestEndTimeUtc = restPeriod->GetEndTimeUTC();
					restPeriods.push_back(std::move(restPeriod));
				}
			}
			prevDuty = currDuty;
		}

		prevRoster = currRoster;
	}

	//最后一个Roster，计算休息期。不需要考虑，认为rest是0
	//const ROSTER* tailRoster = *(rosters.end() - 1);


	//按开始时间排序
	std::stable_sort(restPeriods.begin(), restPeriods.end(),
		[](const std::unique_ptr<RestPeriod>& src, const std::unique_ptr<RestPeriod>& dest)->int {
			return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
		}
	);

	return restPeriods;

}

bool RestPeriod::IsAllPreAssign(const std::vector<std::unique_ptr<RestPeriod>>& restPeriods) {
	bool isAllPreAssign = true;
	if (restPeriods.empty()) {
		return false;
	}
	for (auto& restPeriod : restPeriods) {
		if (restPeriod->GetSource() != RosterSource::PA) {
			isAllPreAssign = false;
			break;
		}
	}
	return isAllPreAssign;
}

//Roster中开始时间（计入工作）
time_t RestPeriod::GetWorkStartTimeUTCForRoster(const ROSTER* roster) {
	//TODO by hexd 时间获取，可能有问题
	if (roster->pairing == nullptr) {
		return roster->actStrUtc;
	}
	return roster->pairing->getStartTimeUtcAct();
}

bool RestPeriod::MatchDayOffAssignment(const string& assignment, const std::vector<std::string>& dayOffAssignmentGroups, 
	const std::shared_ptr<CrewDataContext>& dbData) {
	//Duty::DUTY_TYPE dutyType = const_cast<Duty*>(duty)->getType();
	//if ((dutyType == Duty::DUTY_PAIRING_REST) || (dutyType == Duty::DUTY_BLANK_DAY)) {
	//	return true;
	//}
	for (auto assignmentGroup : dayOffAssignmentGroups) {
		if (dbData->isAssignmentInGroup(assignment, assignmentGroup)) {
			return true;
		}
		//map<string, set<string>>::iterator iter = dbData->assignmentNameGroupMap.find(assignGroup);
		//if (iter != dbData->assignmentNameGroupMap.end()) {
		//	if (iter->second.find(assignment) != iter->second.end()) {
		//		return true;
		//	}
		//}
	}
	return false;
}

//Roster中结束时间（计入工作）
time_t RestPeriod::GetWorkEndTimeUTCForRoster(const ROSTER* roster, const bool isUtilizePostDutyRest) {
	//TODO by hexd 时间获取，可能有问题
	if (roster->pairing == nullptr) {
		return isUtilizePostDutyRest ? roster->actRestStrUtc : roster->actEndUtc;
	}
	return isUtilizePostDutyRest ? roster->pairing->getEndTimeUtcAct() : roster->pairing->getEndTimeIncludingRestUtcAct();
}

//Roster中开始时间（计入工作）
time_t RestPeriod::GetWorkStartTimeLocForRoster(const ROSTER* roster) {
	if (roster->pairing == nullptr) {
		return roster->actStrLoc;
	}
	return roster->pairing->getStartTimeLocAct();
}

//Roster中结束时间（计入工作）
time_t RestPeriod::GetWorkEndTimeLocForRoster(const ROSTER* roster, const bool isUtilizePostDutyRest) {
	if (roster->pairing == nullptr) {
		return isUtilizePostDutyRest ? roster->actEndLoc : roster->actRestStrLoc;
	}
	return isUtilizePostDutyRest ? roster->pairing->getEndTimeLocAct() : roster->pairing->getEndTimeIncludingRestLocAct();
}

bool RestPeriod::IsConsecutiveRest(const time_t prevRestEndTimeUtc, const ROSTER* currRoster) {
	if (prevRestEndTimeUtc > 0 && IsConsecutiveTime(prevRestEndTimeUtc, currRoster->actStrUtc)) //连续休息间隔差1分钟也认为连续
	{
		return true;
	}
	return false;
}

bool RestPeriod::IsConsecutiveRest(const time_t prevRestEndTimeUtc, const Duty* currDuty) {
	if (prevRestEndTimeUtc > 0 && IsConsecutiveTime(prevRestEndTimeUtc, currDuty->getStartTimeUtcAct())) //连续休息间隔差1分钟也认为连续
	{
		return true;
	}
	return false;
}