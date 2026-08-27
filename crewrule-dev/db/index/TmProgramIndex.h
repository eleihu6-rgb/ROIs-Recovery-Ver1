#pragma once

#include "CrewDB.h"

class TmProgramIndex {
public:
	TmProgramIndex(const vector<std::shared_ptr<TmProgram>>& tmProgramList);

	const std::shared_ptr<TmProgram> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgram>> getByCrewId(const string& crewId) const;

private:
	map<long long, std::shared_ptr<TmProgram>> _idIndex; //<id, TmProgram>
	unordered_multimap<string, std::shared_ptr<TmProgram>> _crewIdIndex; //<crewId, TmProgram>

	void makeIndex(const vector<std::shared_ptr<TmProgram>>& tmProgramList);
};

class TmProgramBuddyIndex {
public:
	TmProgramBuddyIndex(const vector<std::shared_ptr<TmProgramBuddy>>& tmProgramBuddyList);

	const std::shared_ptr<TmProgramBuddy> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramBuddy>> getByCrewId(const string& crewId) const;

	const vector<std::shared_ptr<TmProgramBuddy>> getByBuddyId(const string& buddyId) const;

private:
	map<long long, std::shared_ptr<TmProgramBuddy>> _idIndex; //<id, TmProgramBuddy>
	unordered_multimap<string, std::shared_ptr<TmProgramBuddy>> _crewIdIndex; //<crewId, TmProgramBuddy>
	unordered_multimap<string, std::shared_ptr<TmProgramBuddy>> _buddyIdIndex; //<buddyId, TmProgramBuddy>

	void makeIndex(const vector<std::shared_ptr<TmProgramBuddy>>& tmProgramBuddyList);
};

class TmProgramBuddyTimeIndex {
public:
	TmProgramBuddyTimeIndex(const vector<std::shared_ptr<TmProgramBuddyTime>>& tmProgramBuddyTimeList);

	const std::shared_ptr<TmProgramBuddyTime> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramBuddyTime>> getByProgramBuddyId(const long long programBuddyId) const;

private:
	map<long long, std::shared_ptr<TmProgramBuddyTime>> _idIndex; //<id, TmProgramBuddyTime>
	unordered_multimap<long long, std::shared_ptr<TmProgramBuddyTime>> _programBuddyIdIndex; //<programBuddyId, TmProgramBuddyTime>

	void makeIndex(const vector<std::shared_ptr<TmProgramBuddyTime>>& tmProgramBuddyTimeList);
};

class TmProgramBuddyCourseIndex {
public:
	TmProgramBuddyCourseIndex(const vector<std::shared_ptr<TmProgramBuddyCourse>>& tmProgramBuddyCourseList);

	const std::shared_ptr<TmProgramBuddyCourse> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramBuddyCourse>> getByProgramId(const long long programId) const;

	const vector<std::shared_ptr<TmProgramBuddyCourse>> getByProgramBuddyId(const long long programBuddyId) const;

	const vector<std::shared_ptr<TmProgramBuddyCourse>> getByProgramBuddyTimeId(const long long programBuddyTimeId) const;

	const vector<std::shared_ptr<TmProgramBuddyCourse>> getByProgramAndCourse(const long long programId, const long long courseId) const;

	//获得同课程的buddy数量
	const int getBuddyNumber(const long long programId, const long long courseId) const;

private:
	map<long long, std::shared_ptr<TmProgramBuddyCourse>> _idIndex; //<id, TmProgramBuddyCourse>
	unordered_multimap<long long, std::shared_ptr<TmProgramBuddyCourse>> _programIdIndex; //<programId, TmProgramBuddyCourse>
	unordered_multimap<long long, std::shared_ptr<TmProgramBuddyCourse>> _programBuddyIdIndex; //<programBuddyId, TmProgramBuddyCourse>
	unordered_multimap<long long, std::shared_ptr<TmProgramBuddyCourse>> _programBuddyTimeIdIndex; //<programBuddyTimeId, TmProgramBuddyCourse>
	unordered_multimap<string, std::shared_ptr<TmProgramBuddyCourse>> _programIdAndCourseIdIndex; //<programId+courseId, TmProgramBuddyCourse>
	
	string makeKey(const long long programId, const long long courseId) const;

	void makeIndex(const vector<std::shared_ptr<TmProgramBuddyCourse>>& tmProgramBuddyCourseList);
};

class TmProgramPipIndex {
public:
	TmProgramPipIndex(const vector<std::shared_ptr<TmProgramPip>>& tmProgramPipList);

	const std::shared_ptr<TmProgramPip> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramPip>> getByProgramId(const long long programId, const string& simioe, const string& phase) const;

private:
	map<long long, std::shared_ptr<TmProgramPip>> _idIndex; //<id, TmProgramPip>
	unordered_multimap<string, std::shared_ptr<TmProgramPip>> _programIdAndSimioeAndPhaseIndex; //<programId+simioe+phase, TmProgramPip>

	void makeIndex(const vector<std::shared_ptr<TmProgramPip>>& tmProgramPipList);

	string makeKey(const long long programId, const string& simioe, const string& phase) const;
};

class TmProgramCourseIndex {
public:
	TmProgramCourseIndex(const unordered_map<long long, std::shared_ptr<TmProgramCourse>>& tmProgramCourseMap);

	const std::shared_ptr<TmProgramCourse> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramCourse>> getByCrewId(const string& crewId) const;

	const vector<std::shared_ptr<TmProgramCourse>> getByRosterId(const long long rosterId) const;

	const std::shared_ptr<TmProgramCourse> getByRosterId(const long long rosterId, const long long flightId) const;

	const std::shared_ptr<TmProgramCourse> getByRosterId(const long long rosterId, const string& groupId) const;

	const vector<std::shared_ptr<TmProgramCourse>> getByGroupId(const string& groupId) const;

	//通过groupId获得任一一名学员的课程
	const std::shared_ptr<TmProgramCourse> getAnyOneByGroupId(const string& groupId) const;

	const vector<std::shared_ptr<TmProgramCourse>> getByProgramId(const long long programId) const;

	const long long getProgramIdByGroupId(const string& groupId) const;

	const vector<std::shared_ptr<TmProgramCourse>> getByFlightId(const long long flightId) const;

	const vector<std::shared_ptr<TmProgramCourse>> getByFlightId(const long long programId, const long long flightId) const;

	//TmProgramCourse.deviceTimeId不在使用
	const vector<std::shared_ptr<TmProgramCourse>> getByDeviceTimeId(const long long deviceTimeId) const;

	const vector<std::shared_ptr<TmProgramCourse>> getChildrenByParentId(const long long parentId) const;

	//通过GroupId获得TmProgramCourse的ID列表
	const vector<long long> getIdsByGroupId(const string& groupId) const;

	/*通过当前计划课程获得全部同一计划课程列表。
	* 计划课程可以被拆分成多个子计划课程，这些课程被认定为同一计划课程
	* @param tmProgramCourse 当前课程可能是父课程，也可能是子课程
	* @return 所有同一课程的计划课程列表
	*/
	const vector<std::shared_ptr<TmProgramCourse>> getSameProgramCourses(const std::shared_ptr<TmProgramCourse>& tmProgramCourse) const;

	//获得该设备在[startTimeUtc,endTimeUtc]时间段内所有计划课程
	const vector<std::shared_ptr<TmProgramCourse>> getByDevice(const string& resourceCode, const time_t startTimeUtc, const time_t endTimeUtc) const;

	//获得program中指定课程序号(courseSeq)根的programCourse
	const std::shared_ptr<TmProgramCourse> getRootByProgramId(const long long programId, const string& courseSeq) const;

	//通过course获得ProgramCourse
	const vector<std::shared_ptr<TmProgramCourse>> getByCourseId(const long long courseId) const;
	const vector<std::shared_ptr<TmProgramCourse>> getByCourseIds(const std::set<long long>& courseIds) const;

	//按startTime升序排序
	void sortByStartTime(vector<std::shared_ptr<TmProgramCourse>>& programCourseList) const;

public:
	//创建索引
	void createIndex(const std::shared_ptr<TmProgramCourse>& tmProgramCourse);

	//删除索引
	void removeIndex(const std::shared_ptr<TmProgramCourse>& tmProgramCourse);
private:
	map<long long, std::shared_ptr<TmProgramCourse>> _idIndex; //<id, TmProgramCourse>
	unordered_multimap<string, std::shared_ptr<TmProgramCourse>> _crewIdIndex; //<crewId, TmProgramCourse>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourse>> _programIdIndex; //<programId, TmProgramCourse>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourse>> _rosterIdIndex; //<rosterId, TmProgramCourse>
	unordered_multimap<string, std::shared_ptr<TmProgramCourse>> _groupIdIndex; //<groupId, TmProgramCourse>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourse>> _flightIdIndex; //<fltId, TmProgramCourse>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourse>> _parentIdIndex; //<parentId, TmProgramCourse>
	unordered_multimap<string, std::shared_ptr<TmProgramCourse>> _deviceTimeUtcIndex; //<key, TmProgramCourse>, key=resourceCode + startTime + endTime
	unordered_map<string, std::shared_ptr<TmProgramCourse>> _rootIndex; //<key, TmProgramCourse>, key=programId+courseSeq
	unordered_map<string, std::shared_ptr<TmProgramCourse>> _rosterAndFltIndex; //<rosterId+fltId, TmProgramCourse>
	unordered_map<string, std::shared_ptr<TmProgramCourse>> _programAndFltIndex; //<programId+fltId, TmProgramCourse>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourse>> _courseIdIndex; //<courseId, TmProgramCourse>

	void makeIndex(const unordered_map<long long, std::shared_ptr<TmProgramCourse>>& tmProgramCourseMap);

	string makeDeviceKey(const string& resourceCode, const time_t startTimeUtc, const time_t endTimeUtc) const;

	string makeRootKey(const long long programId, const string& courseSeq) const;

	string makeRosterAndFltKey(const long long rosterId, const long long fltId) const;

	string makeProgramAndFltKey(const long long programId, const long long fltId) const;


};

class TmProgramCourseInstructorIndex {
public:
	TmProgramCourseInstructorIndex(const unordered_map<long long, std::shared_ptr<TmProgramCourseInstructor>>& tmProgramCourseInstructorMap);

	const std::shared_ptr<TmProgramCourseInstructor> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramCourseInstructor>> getByCrewId(const string& crewId) const;

	const std::shared_ptr<TmProgramCourseInstructor> getByCrewId(const string& crewId, const long long flightId) const;

	const vector<std::shared_ptr<TmProgramCourseInstructor>> getByRosterId(const long long rosterId) const;

	const std::shared_ptr<TmProgramCourseInstructor> getByRosterId(const long long rosterId, const long long flightId) const;

	const std::shared_ptr<TmProgramCourseInstructor> getByRosterId(const long long rosterId, const string& groupId) const;

	const vector<std::shared_ptr<TmProgramCourseInstructor>> getByGroupId(const string& groupId) const;

	const vector<std::shared_ptr<TmProgramCourseInstructor>> getByGroupIdAndRole(const string& groupId, const string& role) const;

	const vector<std::shared_ptr<TmProgramCourseInstructor>> getByGroupIdAndRole(const string& groupId, const vector<string>& roles) const;

	const vector<std::shared_ptr<TmProgramCourseInstructor>> getByFlightId(const long long flightId) const;

	//获得该设备在[startTimeUtc,endTimeUtc]时间段内所有计划课程
	const vector<std::shared_ptr<TmProgramCourseInstructor>> getByDevice(const string& resourceCode, const time_t startTimeUtc, const time_t endTimeUtc) const;
	
public:
	//创建索引
	void createIndex(const std::shared_ptr<TmProgramCourseInstructor>& tmProgramCourseInstructor);

	//删除索引
	void removeIndex(const std::shared_ptr<TmProgramCourseInstructor>& tmProgramCourseInstructor);

private:
	map<long long, std::shared_ptr<TmProgramCourseInstructor>> _idIndex; //<id, TmProgramCourseInstructor>
	unordered_multimap<string, std::shared_ptr<TmProgramCourseInstructor>> _crewIdIndex; //<crewId, TmProgramCourseInstructor>
	unordered_map<string, std::shared_ptr<TmProgramCourseInstructor>> _crewIdAndFltIndex; //<crewId+fltId, TmProgramCourseInstructor>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseInstructor>> _rosterIdIndex; //<rosterId, TmProgramCourseInstructor>
	unordered_multimap<string, std::shared_ptr<TmProgramCourseInstructor>> _groupIdIndex; //<groupId, TmProgramCourseInstructor>
	unordered_multimap<string, std::shared_ptr<TmProgramCourseInstructor>> _groupIdAndRoleIndex; //<groupId+role, TmProgramCourseInstructor>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseInstructor>> _flightIdIndex; //<fltId, TmProgramCourseInstructor>
	unordered_multimap<string, std::shared_ptr<TmProgramCourseInstructor>> _deviceTimeUtcIndex; //<key, TmProgramCourseInstructor>, key=resourceCode + startTime + endTime
	unordered_map<string, std::shared_ptr<TmProgramCourseInstructor>> _rosterAndFltIndex; //<rosterId+fltId, TmProgramCourseInstructor>
	

	void makeIndex(const unordered_map<long long, std::shared_ptr<TmProgramCourseInstructor>>& tmProgramCourseInstructorMap);

	string makeKey(const string& groupId, const string& role) const;

	string makeDeviceKey(const string& resourceCode, const time_t startTimeUtc, const time_t endTimeUtc) const;

	string makeRosterAndFltKey(const long long rosterId, const long long fltId) const;

	string makeCrewAndFltKey(const string& crewId, const long long fltId) const;

};

class TmProgramCourseLimitationIndex {
public:
	TmProgramCourseLimitationIndex(const vector<std::shared_ptr<TmProgramCourseLimitation>>& tmProgramCourseLimitationList);

	const std::shared_ptr<TmProgramCourseLimitation> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramCourseLimitation>> getByProgramCourseId(const long long programCourseId) const;

	const vector<std::shared_ptr<TmProgramCourseLimitation>> getByProgramCoursePnrId(const long long programCoursePnrId) const;

private:
	map<long long, std::shared_ptr<TmProgramCourseLimitation>> _idIndex; //<id, TmProgramCourseLimitation>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseLimitation>> _programCourseIdIndex; //<programCourseId, TmProgramCourseLimitation>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseLimitation>> _programCoursePnrIdIndex; //<programCoursePnrId, TmProgramCourseLimitation>

	void makeIndex(const vector<std::shared_ptr<TmProgramCourseLimitation>>& tmProgramCourseLimitationList);
};

class TmProgramCourseIpRelevanceIndex {
public:
	TmProgramCourseIpRelevanceIndex(const vector<std::shared_ptr<TmProgramCourseIpRelevance>>& tmProgramCourseIpRelevanceList);

	const std::shared_ptr<TmProgramCourseIpRelevance> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramCourseIpRelevance>> getByProgramCourseId(const long long programCourseId) const;

	const vector<std::shared_ptr<TmProgramCourseIpRelevance>> getByProgramCourseInstructorId(const long long programCourseInstructorId) const;

private:
	map<long long, std::shared_ptr<TmProgramCourseIpRelevance>> _idIndex; //<id, TmProgramCourseIpRelevance>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseIpRelevance>> _programCourseIdIndex; //<programCourseId, TmProgramCourseIpRelevance>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseIpRelevance>> _programCourseInstructorIdIndex; //<programCourseInstructorId, TmProgramCourseIpRelevance>

	void makeIndex(const vector<std::shared_ptr<TmProgramCourseIpRelevance>>& tmProgramCourseIpRelevanceList);
};

class TmProgramCourseRoleIndex {
public:
	TmProgramCourseRoleIndex(const vector<std::shared_ptr<TmProgramCourseRole>>& tmProgramCourseRoleList);

	const std::shared_ptr<TmProgramCourseRole> getById(const long long id) const;

	//@return map<role, role对应TmProgramCourseRole列表>
	const map<string, vector<std::shared_ptr<TmProgramCourseRole>>> getByProgramCourseId(const long long tmProgramCourseId, const string& roleType) const;

	//@return map<role, role对应TmProgramCourseRole列表>
	const map<string, vector<std::shared_ptr<TmProgramCourseRole>>>  getByProgramCourseIds(const vector<long long> tmProgramCourseIds, const string& roleType) const;

	const vector<std::shared_ptr<TmProgramCourseRole>> getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const;

private:
	map<long long, std::shared_ptr<TmProgramCourseRole>> _idIndex; //<id, TmProgramCourseRole>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseRole>> _programCourseIdIndex; //<tmProgramCourseId, TmProgramCourseRole>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseRole>> _programCoursePnrIdIndex; //<tmProgramCoursePnrId, TmProgramCourseRole>

	void makeIndex(const vector<std::shared_ptr<TmProgramCourseRole>>& tmProgramCourseRoleList);
};

class TmProgramCourseRoleQualIndex {
public:
	TmProgramCourseRoleQualIndex(const vector<std::shared_ptr<TmProgramCourseRoleQual>>& tmProgramCourseRoleQualList);

	const std::shared_ptr<TmProgramCourseRoleQual> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramCourseRoleQual>> getByProgramCourseId(const long long programCourseId) const;

	const vector<std::shared_ptr<TmProgramCourseRoleQual>> getByProgramCoursePnrId(const long long programCoursePnrId) const;

	const vector<std::shared_ptr<TmProgramCourseRoleQual>> getByProgramCourseRoleId(const long long programCourseRoleId) const;

private:
	map<long long, std::shared_ptr<TmProgramCourseRoleQual>> _idIndex; //<id, TmProgramCourseRoleQual>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseRoleQual>> _programCourseIdIndex; //<programCourseId, TmProgramCourseRoleQual>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseRoleQual>> _programCoursePnrIdIndex; //<programCoursePnrId, TmProgramCourseRoleQual>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseRoleQual>> _programCourseRoleIdIndex; //<programCourseRoleId, TmProgramCourseRoleQual>

	void makeIndex(const vector<std::shared_ptr<TmProgramCourseRoleQual>>& tmProgramCourseRoleQualList);
};

class TmProgramCourseRoleLimitationIndex {
public:
	TmProgramCourseRoleLimitationIndex(const vector<std::shared_ptr<TmProgramCourseRoleLimitation>>& tmProgramCourseRoleLimitationList);

	const std::shared_ptr<TmProgramCourseRoleLimitation> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramCourseRoleLimitation>> getByProgramCourseId(const long long programCourseId) const;

	const vector<std::shared_ptr<TmProgramCourseRoleLimitation>> getByProgramCoursePnrId(const long long programCoursePnrId) const;

	const vector<std::shared_ptr<TmProgramCourseRoleLimitation>> getByProgramCourseRoleId(const long long programCourseRoleId) const;

private:
	map<long long, std::shared_ptr<TmProgramCourseRoleLimitation>> _idIndex; //<id, TmProgramCourseRoleLimitation>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseRoleLimitation>> _programCourseIdIndex; //<programCourseId, TmProgramCourseRoleLimitation>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseRoleLimitation>> _programCoursePnrIdIndex; //<programCoursePnrId, TmProgramCourseRoleLimitation>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseRoleLimitation>> _programCourseRoleIdIndex; //<programCourseRoleId, TmProgramCourseRoleLimitation>

	void makeIndex(const vector<std::shared_ptr<TmProgramCourseRoleLimitation>>& tmProgramCourseRoleLimitationList);
};

class TmProgramCourseIpRoleIndex {
public:
	TmProgramCourseIpRoleIndex(const vector<std::shared_ptr<TmProgramCourseIpRole>>& tmProgramCourseIpRoleList);

	const std::shared_ptr<TmProgramCourseIpRole> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramCourseIpRole>> getByProgramCourseId(const long long tmProgramCourseId) const;

	const vector<std::shared_ptr<TmProgramCourseIpRole>>  getByProgramCourseIds(const vector<long long> tmProgramCourseIds) const;

	const vector<std::shared_ptr<TmProgramCourseIpRole>> getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const;

private:
	map<long long, std::shared_ptr<TmProgramCourseIpRole>> _idIndex; //<id, TmProgramCourseIpRole>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseIpRole>> _programCourseIdIndex; //<tmProgramCourseId, TmProgramCourseIpRole>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseIpRole>> _programCoursePnrIdIndex; //<tmProgramCoursePnrId, TmProgramCourseIpRole>

	void makeIndex(const vector<std::shared_ptr<TmProgramCourseIpRole>>& tmProgramCourseIpRoleList);
};

class TmProgramCourseIpRoleBaseIndex {
public:
	TmProgramCourseIpRoleBaseIndex(const vector<std::shared_ptr<TmProgramCourseIpRoleBase>>& tmProgramCourseIpRoleBaseList);

	const std::shared_ptr<TmProgramCourseIpRoleBase> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramCourseIpRoleBase>> getByProgramCourseId(const long long tmProgramCourseId) const;

	const vector<std::shared_ptr<TmProgramCourseIpRoleBase>> getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const;

	const vector<std::shared_ptr<TmProgramCourseIpRoleBase>> getByProgramCourseIpRoleId(const long long tmProgramCourseIpRoleId) const;

private:
	map<long long, std::shared_ptr<TmProgramCourseIpRoleBase>> _idIndex; //<id, TmProgramCourseIpRoleBase>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseIpRoleBase>> _programCourseIdIndex; //<tmProgramCourseId, TmProgramCourseIpRoleBase>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseIpRoleBase>> _programCoursePnrIdIndex; //<tmProgramCoursePnrId, TmProgramCourseIpRoleBase>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseIpRoleBase>> _programCourseIpRoleIdIndex; //<tmProgramCourseIpRoleId, TmProgramCourseIpRoleBase>

	void makeIndex(const vector<std::shared_ptr<TmProgramCourseIpRoleBase>>& tmProgramCourseIpRoleBaseList);
};

class TmProgramCourseIpRoleQualIndex {
public:
	TmProgramCourseIpRoleQualIndex(const vector<std::shared_ptr<TmProgramCourseIpRoleQual>>& tmProgramCourseIpRoleQualList);

	const std::shared_ptr<TmProgramCourseIpRoleQual> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramCourseIpRoleQual>> getByProgramCourseId(const long long programCourseId) const;

	const vector<std::shared_ptr<TmProgramCourseIpRoleQual>> getByProgramCoursePnrId(const long long programCoursePnrId) const;

	const vector<std::shared_ptr<TmProgramCourseIpRoleQual>> getByProgramCourseIpRoleId(const long long programCourseIpRoleId) const;

	const vector<std::shared_ptr<TmProgramCourseIpRoleQual>> getByProgramCourseIpRoleBaseId(const long long programCourseIpRoleBaseId) const;

private:
	map<long long, std::shared_ptr<TmProgramCourseIpRoleQual>> _idIndex; //<id, TmProgramCourseIpRoleQual>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseIpRoleQual>> _programCourseIdIndex; //<programCourseId, TmProgramCourseIpRoleQual>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseIpRoleQual>> _programCoursePnrIdIndex; //<programCoursePnrId, TmProgramCourseIpRoleQual>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseIpRoleQual>> _programCourseIpRoleIdIndex; //<programCourseIpRoleId, TmProgramCourseIpRoleQual>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseIpRoleQual>> _programCourseIpRoleBaseIdIndex; //<programCourseIpRoleBaseId, TmProgramCourseIpRoleQual>

	void makeIndex(const vector<std::shared_ptr<TmProgramCourseIpRoleQual>>& tmProgramCourseIpRoleQualList);
};

class TmProgramCoursePnrIndex {
public:
	TmProgramCoursePnrIndex(const vector<std::shared_ptr<TmProgramCoursePnr>>& tmProgramCoursePnrList);

	const std::shared_ptr<TmProgramCoursePnr> getById(const long long id) const;

	const std::shared_ptr<TmProgramCoursePnr> getByProgramCourseId(const long long tmProgramCourseId) const;

	const vector<std::shared_ptr<TmProgramCoursePnr>> getByProgramCourseIds(const vector<long long> tmProgramCourseIds) const;

private:
	map<long long, std::shared_ptr<TmProgramCoursePnr>> _idIndex; //<id, TmProgramCoursePnr>
	unordered_map<long long, std::shared_ptr<TmProgramCoursePnr>> _programCourseIdIndex; //<tmProgramCourseId, TmProgramCoursePnr>

	void makeIndex(const vector<std::shared_ptr<TmProgramCoursePnr>>& tmProgramCoursePnrList);
};

class TmProgramCourseIpckIndex {
public:
	TmProgramCourseIpckIndex(const vector<std::shared_ptr<TmProgramCourseIpck>>& tmProgramCourseIpckList);

	const std::shared_ptr<TmProgramCourseIpck> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramCourseIpck>> getByProgramCourseId(const long long tmProgramCourseId) const;

	const vector<std::shared_ptr<TmProgramCourseIpck>> getByProgramCourseIds(const vector<long long> tmProgramCourseIds) const;

	const vector<std::shared_ptr<TmProgramCourseIpck>> getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const;

private:
	map<long long, std::shared_ptr<TmProgramCourseIpck>> _idIndex; //<id, TmProgramCourseIpck>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseIpck>> _programCourseIdIndex; //<tmProgramCourseId, TmProgramCourseIpck>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseIpck>> _programCoursePnrIdIndex; //<tmProgramCoursePnrId, TmProgramCourseIpck>

	void makeIndex(const vector<std::shared_ptr<TmProgramCourseIpck>>& tmProgramCourseIpckList);
};

//TmProgramCourseMoreIndex
class TmProgramCourseMoreIndex {
public:
	TmProgramCourseMoreIndex(const vector<std::shared_ptr<TmProgramCourseMore>>& tmProgramCourseMoreList);

	const std::shared_ptr<TmProgramCourseMore> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramCourseMore>> getByProgramCourseId(const long long tmProgramCourseId) const;

	const vector<std::shared_ptr<TmProgramCourseMore>> getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const;

private:
	map<long long, std::shared_ptr<TmProgramCourseMore>> _idIndex; //<id, TmProgramCourseMore>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseMore>> _programCourseIdIndex; //<tmProgramCourseId, TmProgramCourseMore>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseMore>> _programCoursePnrIdIndex; //<tmProgramCoursePnrId, TmProgramCourseMore>

	void makeIndex(const vector<std::shared_ptr<TmProgramCourseMore>>& tmProgramCourseMoreList);
};

//TmProgramCourseMoreLegIndex
class TmProgramCourseMoreLegIndex {
public:
	TmProgramCourseMoreLegIndex(const vector<std::shared_ptr<TmProgramCourseMoreLeg>>& tmProgramCourseMoreLegList);

	const std::shared_ptr<TmProgramCourseMoreLeg> getById(const long long id) const;

	const vector<std::shared_ptr<TmProgramCourseMoreLeg>> getByProgramId(const long long programId) const;

	const vector<std::shared_ptr<TmProgramCourseMoreLeg>> getByProgramCourseId(const long long tmProgramCourseId) const;

	const vector<std::shared_ptr<TmProgramCourseMoreLeg>> getByProgramCoursePnrId(const long long tmProgramCoursePnrId) const;

	const vector<std::shared_ptr<TmProgramCourseMoreLeg>> getByProgramCourseMoreId(const long long tmProgramCourseMoreId) const;

private:
	map<long long, std::shared_ptr<TmProgramCourseMoreLeg>> _idIndex; //<id, TmProgramCourseMoreLeg>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseMoreLeg>> _programIdIndex; //<programId, TmProgramCourseMoreLeg>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseMoreLeg>> _programCourseIdIndex; //<tmProgramCourseId, TmProgramCourseMoreLeg>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseMoreLeg>> _programCoursePnrIdIndex; //<tmProgramCoursePnrId, TmProgramCourseMoreLeg>
	unordered_multimap<long long, std::shared_ptr<TmProgramCourseMoreLeg>> _programCourseMoreIdIndex; //<tmProgramCourseMoreId, TmProgramCourseMoreLeg>

	void makeIndex(const vector<std::shared_ptr<TmProgramCourseMoreLeg>>& tmProgramCourseMoreLegList);
};

//TmDeviceTimeIndex
class TmDeviceTimeIndex {
public:
	TmDeviceTimeIndex(const vector<std::shared_ptr<TmDeviceTime>>& tmDeviceTimeList, const CrewDataContext* dbData);

	const std::shared_ptr<TmDeviceTime> getById(const long long id) const;

	//通过resourceCode返回不包括模拟机SIM返回结果（status == "U_F"）
	const vector<std::shared_ptr<TmDeviceTime>> getByResourceCode(const string& resourceCode) const;

	//startTimeUtc、endTimeUtc：设备使用的开始时间和结束时间（UTC）
	const std::shared_ptr<TmDeviceTime> getByUtcTime(const string& resourceCode, const time_t startTimeUtc, const time_t endTimeUtc) const;

	//获得与设备使用的开始时间和结束时间（UTC）[startTimeUtc、endTimeUtc]出现时间重叠的设备时间
	const vector<std::shared_ptr<TmDeviceTime>> getTimeOverlapByUtcTime(const string& resourceCode, const time_t startTimeUtc, const time_t endTimeUtc, const bool isContainEqual = true) const;

	//获得设备所在地点的时区
	int getTimeZoneOffset(const string& resourceCode, const time_t baseUtcTime) const;
private:
	const CrewDataContext* _dbData;
	map<long long, std::shared_ptr<TmDeviceTime>> _idIndex; //map<id, TmDeviceTime>
	unordered_multimap<string, std::shared_ptr<TmDeviceTime>> _resourceCodeIndex;//multimap<resourceCode,TmDeviceTime>
	map<string, std::shared_ptr<TmDeviceTime>> _utcTimeIndex; //map<key, TmDeviceTime>，key = resource_code + start_date + start_time + end_date + end_time，时间转换成UTC时间 

	void makeIndex(const vector<std::shared_ptr<TmDeviceTime>>& tmDeviceTimeList);

	string makeUtcTimeKey(const string& resourceCode, const time_t startTimeUtc, const time_t endTimeUtc) const;

	string makeUtcTimeKey(const std::shared_ptr<TmDeviceTime>& tmDeviceTime) const;
};