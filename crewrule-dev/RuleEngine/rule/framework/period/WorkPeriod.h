#ifndef _NEWRULEENGINE_WORK_PERIOD_H_
#define _NEWRULEENGINE_WORK_PERIOD_H_

#include <vector>
#include <memory>
#include "CrewDB.h"
#include "Period.h"
#include "SlideListener.h"

typedef enum {
	NA, //未知
	GroundRoster, //地面任务
	FltDuty, //航班Duty任务
	BlankDay //空白天任务
} WorkType;

std::string GetWorkTypeEnumName(const WorkType workType);

class WorkPeriod : public Period {
public:

	void SetWork(const Activity* work) {
		_work = const_cast<Activity*>(work);
	}

	Activity* GetWork() const {
		return _work;
	}

	void SetWorkType(const WorkType workType) {
		_workType = workType;
	}

	WorkType GetWorkType() const {
		return _workType;
	}
	
	void SetRoster(const ROSTER* roster) {
		_roster = (ROSTER * )roster;
	}

	ROSTER* GetRoster() const {
		return _roster;
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
	* 获得工作时间列表
	* @param: rosters 员工排班列表
	* @param: dbData 数据模块
	* @return 
	*/
	static std::vector<std::unique_ptr<WorkPeriod>> GetWorkPeriods(const std::vector<const ROSTER*>& rosters, 
		const std::shared_ptr<CrewDataContext>& dbData);

	/**
	* 获得工作时间列表
	* @param: rosters 员工排班列表
	* @param: workingAssignmentGroups 工作任务组
	* @param: dbData 数据模块
	* @param: isCountBlankDay 空白天是否是休息， true: 空白天休息，false: 空白天是工作日
	* @return
	*/
	static std::vector<std::unique_ptr<WorkPeriod>> GetWorkPeriods(const std::vector<const ROSTER*>& rosters, const std::vector<std::string>& workingAssignmentGroups,
		const std::shared_ptr<CrewDataContext>& dbData);

	/**
	* 获得工作时间列表
	* @param: pairing Pairing
	* @param: workingAssignmentGroups 工作任务组
	* @param: dbData 数据模块
	* @return
	*/
	static std::vector<std::unique_ptr<WorkPeriod>> GetWorkPeriods(const Pairing* pairing, const std::vector<std::string>& workingAssignmentGroups, const std::shared_ptr<CrewDataContext>& dbData);

	/**
	* 获得工作时间列表
	* @param: rosters 员工排班列表
	* @param: restAssignmentGroups 休息任务组(不计入工作)
	* @param: dbData 数据模块
	* @return
	*/
	static std::vector<std::unique_ptr<WorkPeriod>> GetWorkPeriods2(const std::vector<const ROSTER*>& rosters, const std::vector<std::string>& restAssignmentGroups,
		const std::shared_ptr<CrewDataContext>& dbData);

	/**
	* 当空白天不作为休息时，将空白天工作任务追加到WorkPeriods中
	* @param: workPeriods
	* @param: offsetTZMinutes
	* @return 
	*/
	static void AppendBlankDaysToWorkPeriods(std::vector<std::unique_ptr<WorkPeriod>>& workPeriods, const int offsetTZMinutes);
	
	/**
	* 获得工作时间列表(FDP开始结束)
	* @param: rosters 员工排班列表
	* @param: dbData 数据模块
	* @return
	*/
	static std::vector<std::unique_ptr<WorkPeriod>> GetWorkFDPPeriods(const std::vector<const ROSTER*>& rosters, 
		const std::shared_ptr<CrewDataContext>& dbData);

	/**
	* 获得工作时间列表，通过计划时间检查（EVA)
	* @param: rosters 员工排班列表
	* @param: dbData 数据模块
	* @return
	*/
	static std::vector<std::unique_ptr<WorkPeriod>> GetWorkPeriodsBySch(const std::vector<const ROSTER*>& rosters,
		const std::shared_ptr<CrewDataContext>& dbData);

	/**
	* 获得工作时间列表(FDP开始结束)，通过计划时间检查（EVA)
	* @param: rosters 员工排班列表
	* @param: dbData 数据模块
	* @return
	*/
	static std::vector<std::unique_ptr<WorkPeriod>> GetWorkFDPPeriodsBySch(const std::vector<const ROSTER*>& rosters,
		const std::shared_ptr<CrewDataContext>& dbData);

	/*
	* 是否全部是预占
	* @param restPeriods 休息列表
	* @return true-全部是预占,false - 不是全部预占
	*/
	static bool IsAllPreAssign(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods);

	///**
	//* 获得工作时间列表
	//* @param: rosters 员工排班列表
	//* @param: dayOffAssignmentGroups 休息日类任务所属任务组，即：计入休息的任务组
	//* @param: isUtilizePostDutyRest 航后休息是否计入休息
	//* @param: isCountBlankDay 空白天是否计入休息
	//* @param: isUltilizeLayover 过夜是否计入休息（过夜是指Duty之间休息时长）
	//* @return 
	//*/
	//static std::vector<std::unique_ptr<WorkPeriod>> GetWorkPeriods(const std::vector<const ROSTER*>& rosters, 
	//	const std::vector<std::string>& dayOffAssignmentGroups,	const bool isUtilizePostDutyRest,
	//	const bool isCountBlankDay,	const bool isUltilizeLayover,
	//	std::shared_ptr<CrewDataContext> dbData);

	/**
	* 滑动（滚动）窗口
	* @param: workPeriods 工作时间
	* @param: windowSize 窗口大小（分钟数）
	* @param: slideUnit 滑动（滚动）窗口时间单位，RH-按小时滑动（滚动），CD-按天滑动（滚动）
	*/
	static bool Slide(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods,
		const unsigned int& windowSize, const std::string& slideUnit, const SlideListener& slideListener);

private:
	WorkType _workType = WorkType::NA;

	std::string _key{};//Key + WorkType 唯一性

	std::string _source{}; //取值来自roster.source

	Activity* _work = nullptr;

	ROSTER* _roster = nullptr;

	static bool Slide(int& startIndex, const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods,
		const time_t& windowStart, const time_t& windowEnd, const time_t& windowSlideSize, const SlideListener& slideListener);

	static bool IsSlideWindow(const WorkPeriod& workPeriod, const time_t& windowStart, const time_t& windowEnd);

};

#endif //_NEWRULEENGINE_WORK_PERIOD_H_