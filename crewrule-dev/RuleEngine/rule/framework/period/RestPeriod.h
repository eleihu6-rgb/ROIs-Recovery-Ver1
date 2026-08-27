#ifndef _NEWRULEENGINE_REST_PERIOD_H_
#define _NEWRULEENGINE_REST_PERIOD_H_

#include <vector>
#include <string>
#include "CrewDB.h"

#include "Period.h"


enum RestType {
	DUTY_LAYOVER = 1, //Pairing内Duty之间休息
	PAIRING_POST = 2 //Pairing后休息

};

class RestPeriod : public Period {

public:
	void SetRestType(const RestType restType) {
		_restType = restType;
	}

	RestType GetRestType() const {
		return _restType;
	}

	void SetSource(const std::string& source) {
		_source = source;
	}

	std::string GetSource() const {
		return _source;
	}

	/**
	* 获得休息时间列表
	* @param: rosters 员工排班列表
	* @param: dayOffAssignmentGroups 休息日类任务所属任务组，即：计入休息的任务组
	* @param: isUtilizePostDutyRest 航后休息是否计入休息（这里航后休息特指Pairing最后Duty休息时长，不是完整概念的航后休息）
	* @param: isUltilizeLayover 过夜是否计入休息（过夜是指Pairing内Duty之间休息时长）
	* @param: isCountBlankDay 空白天是否计入休息
	* @return
	*/
	static std::vector<std::unique_ptr<RestPeriod>> GetRestPeriods(const std::vector<const ROSTER*>& rosters,
		const std::vector<std::string>& dayOffAssignmentGroups, const bool isUtilizePostDutyRest,
		const bool isUltilizeLayover, const bool isCountBlankDay,
		const std::shared_ptr<CrewDataContext>& dbData, const bool isMerge = true);

	/**
	* 获得休息时间列表
	* @param: rosters 员工排班列表
	* @param: workingAssignmentGroups 工作任务组
	* @param: isCountBlankDay 空白天是否计入休息
	* @return
	*/
	static std::vector<std::unique_ptr<RestPeriod>> GetRestPeriods(const std::vector<const ROSTER*>& rosters, const std::shared_ptr<CrewDataContext>& dbData,
		const std::vector<std::string>& workingAssignmentGroups, const bool isCountBlankDay = true, const bool isUtilizePostDutyRest = true,
		const bool isUltilizeLayover = true, const bool isMerge = true);

	/**
    * 获得休息时间列表, 其中：REST组以及Assignment的Type为L和O认为是休息任务
	* @param: rosters 员工排班列表
	* @param: isUtilizePostDutyRest 航后休息是否计入休息（这里航后休息特指Pairing最后Duty休息时长，不是完整概念的航后休息）
	* @param: isUltilizeLayover 过夜是否计入休息（过夜是指Pairing内Duty之间休息时长）
	* @param: isCountBlankDay 空白天是否计入休息
	* @return
	*/
	static std::vector<std::unique_ptr<RestPeriod>> GetRestPeriods(const std::vector<const ROSTER*>& rosters,
		const bool isUtilizePostDutyRest, const bool isUltilizeLayover, const bool isCountBlankDay,
		const std::shared_ptr<CrewDataContext>& dbData, const bool isMerge = true);

	/*
	* 是否全部是预占
	* @param restPeriods 休息列表
	* @return true-全部是预占,false - 不是全部预占
	*/
	static bool IsAllPreAssign(const std::vector<std::unique_ptr<RestPeriod>>& restPeriods);

private:
	RestType _restType;

	std::string _source{}; //取值来自roster.source

	/**
	* Roster中开始时间（计入工作）UTC时区
	* @param: roster 员工排班
	* @return
	*/
	static time_t GetWorkStartTimeUTCForRoster(const ROSTER* roster);

	/**
	* Roster中结束时间（计入工作）UTC时区
	* isUtilizePostDutyRest=true 表示航后休息计入休息，则Roster工作时间不包含该段时间
	* isUtilizePostDutyRest=flase 表示航后休息不计入休息，则Roster工作时间包含该段时间
	* @param: roster 员工排班
	* @param: isUtilizePostDutyRest 航后休息，为true表示roster的pariing最后一个duty休息时间计入休息期，否则不计入
	* @return
	*/
	static time_t GetWorkEndTimeUTCForRoster(const ROSTER* roster, const bool isUtilizePostDutyRest);

	/**
	* Roster中开始时间（计入工作），本地时区
	* @param: roster 员工排班
	* @return
	*/
	static time_t GetWorkStartTimeLocForRoster(const ROSTER* roster);

	/**
	* Roster中结束时间（计入工作），本地时区
	* isUtilizePostDutyRest=true 表示航后休息计入休息，则Roster工作时间不包含该段时间
	* isUtilizePostDutyRest=flase 表示航后休息不计入休息，则Roster工作时间包含该段时间
	* @param: roster 员工排班
	* @param: isUtilizePostDutyRest 航后休息，为true表示roster的pariing最后一个duty休息时间计入休息期，否则不计入
	* @return
	*/
	static time_t GetWorkEndTimeLocForRoster(const ROSTER* roster, const bool isUtilizePostDutyRest);


	static bool MatchDayOffAssignment(const string& assignment, const std::vector<std::string>& dayOffAssignmentGroups, const std::shared_ptr<CrewDataContext>& dbData);

	static bool IsConsecutiveRest(const time_t prevRestEndTimeUtc, const ROSTER* currRoster);

	static bool IsConsecutiveRest(const time_t prevRestEndTimeUtc, const Duty* currDuty);

public:

	//是否连续时间，二个时间间隔等于1分钟，认为是连续时间
	inline static bool IsConsecutiveTime(const time_t startTimeUtc, const time_t endTimeUtc) {
		return (endTimeUtc - startTimeUtc) == 60 || startTimeUtc == endTimeUtc || startTimeUtc > endTimeUtc;
	}
	
};

class RestPeriods {

public:

	std::vector<std::unique_ptr<RestPeriod>>& Get() const;

	void Add(const std::unique_ptr<RestPeriod>& restPeriod);

	time_t GetStartTime() const {
		return _startTime;
	}

	void SetStartTime(const time_t startTime) {
		_startTime = startTime;
	}

	time_t GetEndTime() const {
		return _endTime;
	}

	void SetEndTime(const time_t endTime) {
		_endTime = endTime;
	}

private:
	std::vector<std::unique_ptr<RestPeriod>> _restPeriods;

	time_t _startTime;

	time_t _endTime;

};


#endif //_NEWRULEENGINE_REST_PERIOD_H_
