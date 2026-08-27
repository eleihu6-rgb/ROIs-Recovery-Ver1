#ifndef _NEWRULEENGINE_WORK_REST_PERIOD_H_
#define _NEWRULEENGINE_WORK_REST_PERIOD_H_

#include <vector>
#include <memory>
#include "CrewDB.h"
#include "Period.h"
#include "SlideListener.h"

typedef enum {
	NA, //未知
	GroundRoster, //地面任务
	FltDuty, //航班Duty任务
	Rest, //休息
	RestDuty, //休息Duty
	RestRoster, //休息排班
	BlkDay //空白天（未排班，有时也可以理解是一种休息）
} WorkRestType;

std::string GetWorkRestTypeEnumName(const WorkRestType workRestType);

class WorkRestPeriod : public Period {
public:

	void SetData(void* data) {
		_data = data;
	}

	void* GetData() const {
		return _data;
	}

	void SetWorkRestType(const WorkRestType workRestType) {
		_workRestType = workRestType;
	}

	WorkRestType GetWorkRestType() const {
		return _workRestType;
	}
	
	void SetKey(const std::string key) {
		_key = key;
	}

	std::string GetKey() const {
		return _key;
	}

	void SetSource(const std::string& source) {
		_source = source;
	}

	std::string GetSource() const {
		return _source;
	}

	/**
	* 获得工作和休息时间列表
	* @param: rosters 员工排班列表
	* @param: dbData 数据模块
	* @return 
	*/
	static std::vector<std::unique_ptr<WorkRestPeriod>> GetWorkRestPeriods(const std::vector<const ROSTER*>& rosters,
		const std::vector<std::string>& dayOffAssignmentGroups, const bool isUtilizePostDutyRest,
		const bool isUltilizeLayover, const bool isCountBlankDay,
		const std::shared_ptr<CrewDataContext>& dbData);

	/**
	* 获得工作和休息时间列表
	* @param: rosters 员工排班列表
	* @param: dbData 数据模块
	* @return
	*/
	static std::vector<std::unique_ptr<WorkRestPeriod>> GetWorkRestPeriods(const Pairing* pairing,
		const std::vector<std::string>& dayOffAssignmentGroups, const bool isUtilizePostDutyRest,
		const bool isUltilizeLayover, const bool isCountBlankDay,
		const std::shared_ptr<CrewDataContext>& dbData);
private:
	WorkRestType _workRestType = WorkRestType::NA;

	std::string _key{};//Key + WorkType 唯一性

	std::string _source{}; //取值来自roster.source

	void* _data = nullptr;

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
};

#endif //_NEWRULEENGINE_WORK_REST_PERIOD_H_