#include "WorkRestPeriod.h"

#include <algorithm>
#include "Duty.h"
#include "UtilFunc.h"
#include "RuleParams.h"
#include "../utils/AssignmentUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"

std::string GetWorkRestTypeEnumName(const WorkRestType workRestType) {
	if (workRestType == WorkRestType::GroundRoster) {
		return "Ground";
	}
	else if (workRestType == WorkRestType::FltDuty) {
		return "Duty";
	}
	else if (workRestType == WorkRestType::Rest) {
		return "Rest";
	}
	else if (workRestType == WorkRestType::RestDuty) {
		return "RestDuty";
	}
	else if (workRestType == WorkRestType::RestRoster) {
		return "RestRoster";
	}
	else if (workRestType == WorkRestType::BlkDay) {
		return "BlkDay";
	}
	return "NA";
}

std::vector<std::unique_ptr<WorkRestPeriod>> WorkRestPeriod::GetWorkRestPeriods(const std::vector<const ROSTER*>& rosters, 
	const std::vector<std::string>& dayOffAssignmentGroups, const bool isUtilizePostDutyRest,
	const bool isUltilizeLayover, const bool isCountBlankDay,
	const std::shared_ptr<CrewDataContext>& dbData) 
{

	std::vector<std::unique_ptr<WorkRestPeriod>> workRestPeriods;

	if (rosters.empty()) {
		return std::move(workRestPeriods);
	}

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
				std::unique_ptr<WorkRestPeriod> workRestPeriod = std::make_unique<WorkRestPeriod>();
				workRestPeriod->SetStartTimeUTC(0);
				workRestPeriod->SetEndTimeUTC(currRoster->actStrUtc);

				workRestPeriod->SetStartTimeLoc(0);
				workRestPeriod->SetEndTimeLoc(currRoster->actStrLoc);

				workRestPeriod->SetWorkRestType(WorkRestType::BlkDay);
				workRestPeriod->SetData(nullptr);

				if (currRoster->source == "PA") {
					workRestPeriod->SetSource(RosterSource::PA);
				}
				workRestPeriods.push_back(std::move(workRestPeriod));
			}
		}
		else
		{
			//Roster间休息期
			if (isCountBlankDay) {
				//空白天计入休息
				std::unique_ptr<WorkRestPeriod> workRestPeriod = std::make_unique<WorkRestPeriod>();
				workRestPeriod->SetStartTimeUTC(GetWorkEndTimeUTCForRoster(prevRoster, isUtilizePostDutyRest));
				workRestPeriod->SetEndTimeUTC(GetWorkStartTimeUTCForRoster(currRoster));

				workRestPeriod->SetStartTimeLoc(GetWorkEndTimeLocForRoster(prevRoster, isUtilizePostDutyRest));
				workRestPeriod->SetEndTimeLoc(GetWorkStartTimeLocForRoster(currRoster));

				workRestPeriod->SetWorkRestType(WorkRestType::BlkDay);
				workRestPeriod->SetData(nullptr);

				if (prevRoster->source == "PA" && currRoster->source == "PA") {
					workRestPeriod->SetSource(RosterSource::PA);
				}
				workRestPeriods.push_back(std::move(workRestPeriod));
			}
			else {
				//空白天不计入休息
				std::unique_ptr<WorkRestPeriod> workRestPeriod = std::make_unique<WorkRestPeriod>();
				workRestPeriod->SetStartTimeUTC(GetWorkEndTimeUTCForRoster(prevRoster, isUtilizePostDutyRest));
				workRestPeriod->SetEndTimeUTC(GetWorkEndTimeUTCForRoster(currRoster, false));

				workRestPeriod->SetStartTimeLoc(GetWorkEndTimeLocForRoster(prevRoster, isUtilizePostDutyRest));
				workRestPeriod->SetEndTimeLoc(GetWorkEndTimeLocForRoster(currRoster, false));

				workRestPeriod->SetWorkRestType(WorkRestType::Rest);
				workRestPeriod->SetData(nullptr);

				if (prevRoster->source == "PA" && currRoster->source == "PA") {
					workRestPeriod->SetSource(RosterSource::PA);
				}
				workRestPeriods.push_back(std::move(workRestPeriod));
			}
		}

		if (pg == nullptr)
		{
			//判断roster是否是休息ROSTER
			//地面任务,内部存在休息因此直接退出。
			std::unique_ptr<WorkRestPeriod> workRestPeriod = std::make_unique<WorkRestPeriod>();
			workRestPeriod->SetStartTimeUTC(currRoster->actStrUtc);
			workRestPeriod->SetEndTimeUTC(currRoster->actEndUtc);

			workRestPeriod->SetStartTimeLoc(currRoster->actStrLoc);
			workRestPeriod->SetEndTimeLoc(currRoster->actEndLoc);

			workRestPeriod->SetData((void*)currRoster);

			if (currRoster->source == "PA") {
				workRestPeriod->SetSource(RosterSource::PA);
			}

			if (MatchDayOffAssignment(currRoster->qualifier, dayOffAssignmentGroups, dbData)) {
				workRestPeriod->SetWorkRestType(WorkRestType::RestRoster);
			}
			else {
				workRestPeriod->SetWorkRestType(WorkRestType::GroundRoster);
			}
			workRestPeriods.push_back(std::move(workRestPeriod));
			continue;
		}

		//本Pairing内部休息（不包含最后一个Duty的休息）
		const vector<Duty*> dutys = pg->getDutyVec();
		Duty* prevDuty = nullptr;
		for (std::vector<Duty*>::const_iterator dutyIter = dutys.begin(); dutyIter != dutys.end(); ++dutyIter) {
			Duty* currDuty = (*dutyIter);
			if (MatchDayOffAssignment(currDuty->getAssignment(), dayOffAssignmentGroups, dbData))
			{
				//本Pairing当前Duty是休息任务类型
				std::unique_ptr<WorkRestPeriod> workRestPeriod = std::make_unique<WorkRestPeriod>();
				//TODO 时间可能有问题 by hexd
				workRestPeriod->SetStartTimeUTC(prevDuty == nullptr ? currDuty->getStartTimeUtcAct() : (prevDuty->getEndTimeUtcAct() + prevDuty->getActualDropoffMin() * 60));
				workRestPeriod->SetEndTimeUTC(currDuty->getEndTimeUtcAct());

				workRestPeriod->SetStartTimeLoc(prevDuty == nullptr ? currDuty->getStartTimeLocAct() : (prevDuty->getEndTimeLocAct() + prevDuty->getActualDropoffMin() * 60));
				workRestPeriod->SetEndTimeLoc(currDuty->getEndTimeLocAct());

				workRestPeriod->SetWorkRestType(WorkRestType::RestDuty);
				workRestPeriod->SetData(currDuty);

				if (currRoster->source == "PA") {
					workRestPeriod->SetSource(RosterSource::PA);
				}

				workRestPeriods.push_back(std::move(workRestPeriod));
			}
			else {
				//本Pairing当前Duty是任务类型
				std::unique_ptr<WorkRestPeriod> workRestPeriod = std::make_unique<WorkRestPeriod>();
				//TODO 时间可能有问题 by hexd
				workRestPeriod->SetStartTimeUTC(currDuty->getStartTimeUtcAct());
				workRestPeriod->SetEndTimeUTC(currDuty->getEndTimeUtcAct());

				workRestPeriod->SetStartTimeLoc(currDuty->getStartTimeLocAct());
				workRestPeriod->SetEndTimeLoc(currDuty->getEndTimeLocAct());

				workRestPeriod->SetWorkRestType(WorkRestType::FltDuty);
				workRestPeriod->SetData(currDuty);

				if (currRoster->source == "PA") {
					workRestPeriod->SetSource(RosterSource::PA);
				}

				workRestPeriods.push_back(std::move(workRestPeriod));
			}

			//prevDuty和currDuty之间休息
			if (prevDuty != nullptr && isUltilizeLayover) {
				//本Pairing内二个Duty之间
				std::unique_ptr<WorkRestPeriod> workRestPeriod = std::make_unique<WorkRestPeriod>();
				workRestPeriod->SetStartTimeUTC(prevDuty->getEndTimeUtcAct() + prevDuty->getActualDropoffMin() * 60);
				workRestPeriod->SetEndTimeUTC(currDuty->getStartTimeUtcAct());

				workRestPeriod->SetStartTimeLoc(prevDuty->getEndTimeLocAct() + prevDuty->getActualDropoffMin() * 60);
				workRestPeriod->SetEndTimeLoc(currDuty->getStartTimeLocAct());

				workRestPeriod->SetWorkRestType(WorkRestType::Rest);
				workRestPeriod->SetData(nullptr);

				if (currRoster->source == "PA") {
					workRestPeriod->SetSource(RosterSource::PA);
				}

				workRestPeriods.push_back(std::move(workRestPeriod));
			}

			prevDuty = currDuty;
		}

		prevRoster = currRoster;
	}

	//最后一个Roster，计算休息期。不需要考虑，认为rest是0
	//const ROSTER* tailRoster = *(rosters.end() - 1);


	//按开始时间排序
	std::stable_sort(workRestPeriods.begin(), workRestPeriods.end(),
		[](const std::unique_ptr<WorkRestPeriod>& src, const std::unique_ptr<WorkRestPeriod>& dest)->int {
		return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
	}
	);
	return std::move(workRestPeriods);

}

//{
//	std::vector<std::unique_ptr<WorkRestPeriod>> workPeriods;
//	for (std::vector<const ROSTER*>::const_iterator rosterIter2 = rosters.begin(); rosterIter2 != rosters.end(); ++rosterIter2)
//	{
//		const ROSTER* roster = *rosterIter2;
//		string rosterAsnment = roster->duty;
//		Pairing *pg = roster->pairing;
//
//		//休息类任务忽略掉
//		if (RuleParams::GetInstancePtr()->isRestAssignment(rosterAsnment))
//			continue;
//		//休假任务忽略掉
//		if (AssignmentUtils::IsLeaveAssignment(rosterAsnment))
//			continue;
//
//		if (pg == nullptr)
//		{
//			//地面任务工作时间
//			std::unique_ptr<WorkRestPeriod> workPeriod = std::make_unique<WorkRestPeriod>();
//			workPeriod->SetWorkRestType(WorkRestType::GroundRoster);
//			workPeriod->SetKey(StringUtils::lltos(roster->rosterId));
//			workPeriod->SetData((void*)roster);
//			workPeriod->SetStartTimeUTC(roster->actStrUtc);
//			workPeriod->SetEndTimeUTC(roster->actRestStrUtc);
//			workPeriod->SetStartTimeLoc(roster->actStrLoc);
//			workPeriod->SetEndTimeLoc(roster->actRestStrLoc);
//
//			//work->endUtcTime = (*ix)->actRestStrUtc;
//			//work->needRuleCheck = (*ix)->needRuleCheck;
//			if (roster->source == "PA") {
//				workPeriod->SetSource(RosterSource::PA);
//			}
//			workPeriods.push_back(std::move(workPeriod));
//			continue;
//		}
//
//		//TODO ????
//		CalculationManday REST = dbData->getCalculationManday("RESTGAP");
//
//		const vector<Duty*> dutys = pg->getDutyVec();
//		for (std::vector<Duty*>::const_iterator dutyIter2 = dutys.begin(); dutyIter2 != dutys.end(); ++dutyIter2) {
//			const Duty* duty = *dutyIter2;
//			Duty::DUTY_TYPE dutyType = duty->getType();
//			if ((dutyType != Duty::DUTY_PAIRING_REST) && (dutyType != Duty::DUTY_BLANK_DAY))
//			{
//				std::unique_ptr<WorkRestPeriod> workPeriod = std::make_unique<WorkRestPeriod>();
//				workPeriod->SetWorkRestType(WorkRestType::FltDuty);
//				workPeriod->SetKey(StringUtils::lltos(duty->getDutyId()));
//				workPeriod->SetData((void*)duty);
//				workPeriod->SetStartTimeUTC(duty->getStartTimeUtc(REST.str) - duty->getActualPickupMin() * 60);
//				workPeriod->SetEndTimeUTC(duty->getEndTimeUtc(REST.end) + duty->getActualDropoffMin() * 60);
//
//				workPeriod->SetStartTimeLoc(duty->getStartTimeLoc(REST.str) - duty->getActualPickupMin() * 60);
//				workPeriod->SetEndTimeLoc(duty->getEndTimeLoc(REST.end) + duty->getActualDropoffMin() * 60);
//
//				//work->needRuleCheck = roster->needRuleCheck;
//
//				if (roster->source == "PA") {
//					workPeriod->SetSource(RosterSource::PA);
//				}
//				workPeriods.push_back(std::move(workPeriod));
//			}
//		}
//	}
//
//	//按开始时间排序
//	std::stable_sort(workPeriods.begin(), workPeriods.end(),
//		[](const std::unique_ptr<WorkRestPeriod>& src, const std::unique_ptr<WorkRestPeriod>& dest)->int {
//		return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
//	}
//	);
//	return std::move(workPeriods);
//}

//std::vector<std::unique_ptr<WorkRestPeriod>> WorkRestPeriod::GetWorkRestPeriods(const std::vector<const ROSTER*>& rosters, 
//	const std::vector<std::string>& dayOffAssignmentGroups, const bool isUtilizePostDutyRest,
//	const bool isCountBlankDay, const bool isUltilizeLayover,
//	std::shared_ptr<CrewDataContext> dbData) {
//	std::vector<std::unique_ptr<WorkRestPeriod>> workPeriods;
//	for (std::vector<const ROSTER*>::const_iterator rosterIter = rosters.begin(); rosterIter != rosters.end(); ++rosterIter)
//	{
//		string rosterAsnment = (*rosterIter)->duty;
//		Pairing * pg = (*rosterIter)->pairing;
//
//		//休息类任务忽略掉
//		if (RuleParams::GetInstancePtr()->isRestAssignment(rosterAsnment))
//			continue;
//		if (pg == nullptr)
//		{
//			//地面任务工作时间
//			std::unique_ptr<WorkRestPeriod> workPeriod = std::make_unique<WorkRestPeriod>();
//			workPeriod->SetStartTimeUTC((*rosterIter)->actStrUtc);
//			workPeriod->SetEndTimeUTC((*rosterIter)->actRestStrUtc);
//			workPeriod->SetStartTimeLoc((*rosterIter)->actStrLoc);
//			workPeriod->SetEndTimeLoc((*rosterIter)->actRestStrLoc);
//			//work->endUtcTime = (*ix)->actRestStrUtc;
//			//work->needRuleCheck = (*ix)->needRuleCheck;
//			workPeriods.push_back(std::move(workPeriod));
//			continue;
//		}
//
//		if (isUltilizeLayover) {
//			//TODO ????
//			CalculationManday REST = dbData->getCalculationManday("RESTGAP");
//
//			const vector<Duty*> dutys = pg->getDutyVec();
//			for (std::vector<Duty*>::const_iterator dutyIter = dutys.begin(); dutyIter != dutys.end(); ++dutyIter) {
//				Duty::DUTY_TYPE dutyType = (*dutyIter)->getType();
//				if ((dutyType != Duty::DUTY_PAIRING_REST) && (dutyType != Duty::DUTY_BLANK_DAY))
//				{
//					std::unique_ptr<WorkRestPeriod> workPeriod = std::make_unique<WorkRestPeriod>();
//					workPeriod->SetStartTimeUTC((*dutyIter)->getStartTimeUtc(REST.str) - (*dutyIter)->getActualPickupMin() * 60);
//					workPeriod->SetEndTimeUTC((*dutyIter)->getEndTimeUtc(REST.end) + (*dutyIter)->getActualDropoffMin() * 60);
//
//					workPeriod->SetStartTimeLoc((*dutyIter)->getStartTimeLoc(REST.str) - (*dutyIter)->getActualPickupMin() * 60);
//					workPeriod->SetEndTimeLoc((*dutyIter)->getEndTimeLoc(REST.end) + (*dutyIter)->getActualDropoffMin() * 60);
//
//					//work->needRuleCheck = (*rosterIter)->needRuleCheck;
//					workPeriods.push_back(std::move(workPeriod));
//				}
//			}
//		}
//
//	}
//
//	//按开始时间排序
//	std::stable_sort(workPeriods.begin(), workPeriods.end(),
//		[](const std::unique_ptr<WorkRestPeriod>& src, const std::unique_ptr<WorkRestPeriod>& dest)->int {
//		return src->GetStartTimeUTC() < dest->GetStartTimeUTC();
//	}
//	);
//	return std::move(workPeriods);
//}

//Roster中开始时间（计入工作）
time_t WorkRestPeriod::GetWorkStartTimeUTCForRoster(const ROSTER* roster) {
	//TODO by hexd 时间获取，可能有问题
	if (roster->pairing == nullptr) {
		return roster->actStrUtc;
	}
	return roster->pairing->getStartTimeUtcAct();
}

//Roster中结束时间（计入工作）
time_t WorkRestPeriod::GetWorkEndTimeUTCForRoster(const ROSTER* roster, const bool isUtilizePostDutyRest) {
	//TODO by hexd 时间获取，可能有问题
	if (roster->pairing == nullptr) {
		return isUtilizePostDutyRest ? roster->actEndUtc : roster->actRestStrUtc;
	}
	return isUtilizePostDutyRest ? roster->pairing->getEndTimeUtcAct() : roster->pairing->getEndTimeIncludingRestUtcAct();
}

//Roster中开始时间（计入工作）
time_t WorkRestPeriod::GetWorkStartTimeLocForRoster(const ROSTER* roster) {
	if (roster->pairing == nullptr) {
		return roster->actStrLoc;
	}
	return roster->pairing->getStartTimeLocAct();
}

//Roster中结束时间（计入工作）
time_t WorkRestPeriod::GetWorkEndTimeLocForRoster(const ROSTER* roster, const bool isUtilizePostDutyRest) {
	if (roster->pairing == nullptr) {
		return isUtilizePostDutyRest ? roster->actEndLoc : roster->actRestStrLoc;
	}
	return isUtilizePostDutyRest ? roster->pairing->getEndTimeLocAct() : roster->pairing->getEndTimeIncludingRestLocAct();
}

bool WorkRestPeriod::MatchDayOffAssignment(const string& assignment, const std::vector<std::string>& dayOffAssignmentGroups,
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