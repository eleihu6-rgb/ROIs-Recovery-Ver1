#pragma once

#include "CrewDB.h"

class CrewRpRecencyIndex {
public:
	CrewRpRecencyIndex(const CrewDataContext* dbData);

	//获取crew_rp_recency表中已统计机组人员该机型的历史飞时合计(分钟)
	int getHistoryCrewBlhOnFleet(const string& crewId, const string& fleet) const;

	//获得机组人员在截止时间(deadline)之前在该机型飞时合计(分钟)，包括历史飞时和场景内飞时
	int getCrewBlhOnFleet(const string& crewId, const string& fleet, const time_t deadlineUtc) const;

	//获取crew_rp_recency表中已统计机组人员该机型组的历史飞时合计(分钟)
	int getHistoryCrewBlhOnFleetGroup(const string& crewId, const string& fleetGroup) const;

	//获得机组人员在截止时间(deadline)之前在该机型组飞时合计(分钟)，包括历史飞时和场景内飞时
	int getCrewBlhOnFleetGroup(const string& crewId, const string& fleetGroup, const time_t deadlineUtc) const;

private:
	map<string, map<string, int>> _crewBlhOnFleetMap; //<crewId, <fleet, blh>>

	map<string, map<string, int>> _crewBlhOnFleetGroupMap; //<crewId, <fleetGroup, blh>>

	const CrewDataContext* _dbData;

	void makeIndex(const CrewDataContext* dbData);

	//获得机组人员在[场景开始,截止时间(deadlineUtc))之前在该机型飞时合计(分钟)
	int getCrewBlhOnFleetInSenario(const string& crewId, const string& fleet, const time_t deadlineUtc) const;

	//获得机组人员在[场景开始,截止时间(deadlineUtc))之前在该机型飞时合计(分钟)
	int getCrewBlhOnFleetGroupInSenario(const string& crewId, const string& fleetGroup, const time_t deadlineUtc) const;

	bool matchAssignment(const string& assignment) const;
};