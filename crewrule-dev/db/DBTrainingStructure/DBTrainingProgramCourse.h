//
// Created by haoli on 2025/7/3.
//

#ifndef TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSE_H
#define TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSE_H


class DBTrainingProgramCourse {
public:
    DBTrainingProgramCourse(long long id, long long programId, long long courseId, long long validPeriodStart,
                            long long validPeriodEnd, double sequence, long long parentId, long long pairingChartId = 0) :
            _id(id), _programId(programId), _courseId(courseId), _validPeriodStart(validPeriodStart),
            _validPeriodEnd(validPeriodEnd), _sequence(sequence), _parentId(parentId), _pairingChartId(pairingChartId) {}

    const long long GetId() const { return _id; }

    void SetId(long long id) { _id = id; }

    const long long GetProgramId() const { return _programId; }

    void SetProgramId(long long programId) { _programId = programId; }

    const long long GetCourseId() const { return _courseId; }

    void SetCourseId(long long courseId) { _courseId = courseId; }

    const long long GetValidPeriodStart() const { return _validPeriodStart; }

    void SetValidPeriodStart(long long validPeriodStart) { _validPeriodStart = validPeriodStart; }

    const long long GetValidPeriodEnd() const { return _validPeriodEnd; }

    void SetValidPeriodEnd(long long validPeriodEnd) { _validPeriodEnd = validPeriodEnd; }

    double GetSequence() const { return _sequence; }

    void SetSequence(double sequence) { _sequence = sequence; }

    long long GetParentId() const { return _parentId; }

    void SetParentId(long long parentId) { _parentId = parentId; }

    long long GetPairingChartId() const { return _pairingChartId; }

    void SetPairingChartId(long long pairingChartId) { _pairingChartId = pairingChartId; }

private:
    long long _id;
    long long _programId;
    long long _courseId;
    long long _validPeriodStart;
    long long _validPeriodEnd;
    double _sequence;
    long long _parentId;
    long long _pairingChartId;
};


#endif //TRAININGOPTIMIZER_DBTRAININGPROGRAMCOURSE_H
