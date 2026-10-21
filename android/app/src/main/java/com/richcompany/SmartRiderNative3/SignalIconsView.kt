package com.richcompany.smartridernative3

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.util.TypedValue
import android.view.View
import kotlin.math.ceil
import kotlin.math.min

// ★ 사거리 신호 순서 (10-20) — 토스트 안 아이콘 줄
// 앱 미리보기(screens/SignalIconRow.js)와 같은 모양. 오실장 확정 좌표 (48×48 칸, 아래 → 위가 내 방향)
//   직진  : M32 44 V16 (굵기 5.5, 둥근 끝) + 삼각형 32,3 / 39,16 / 25,16
//   좌회전: M32 44 V38 Q32 30 24 30 H16 + 삼각형 4,30 / 16,23 / 16,37
//   직좌  : M32 44 V16 M32 39 Q32 30 24 30 H16 + 두 삼각형
//   다른 진입로는 칸 가운데(24,24) 기준 회전. 내 방향 초록 #1E9E50 (10-21 주황→초록) / 나머지 회색 #8A877F (10-21 파랑→회색)
//   칸 테두리: 내 방향이 들어 있으면 초록. 칸 아래 작은 숫자 = 원래 단계 번호 (number가 null이면 안 그림)
//   6칸까지 한 줄, 넘으면 두 줄. fixedCellDp를 주면 그 크기 칸 하나짜리 (접힌 토스트용)
class SignalIconsView(
    context: Context,
    private val cells: List<Cell>,
    private val fixedCellDp: Float? = null
) : View(context) {

    data class Arrow(val move: String, val rot: Float, val color: Int)
    data class Cell(val number: Int?, val color: Int, val arrows: List<Arrow>)

    companion object {
        val GREEN: Int = Color.parseColor("#1E9E50")
        val BLUE: Int = Color.parseColor("#378ADD")
        val GRAY: Int = Color.parseColor("#8A877F")
        const val GRID = 48f
    }

    private fun dp(v: Float): Float =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)

    private val gap = dp(6f)
    private val border = dp(2f)
    private val numH = dp(14f)
    private val maxCell = dp(52f)

    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 5.5f
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = border
    }
    private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL; color = Color.WHITE }
    private val numPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, 11f, resources.displayMetrics)
        isFakeBoldText = true
    }

    // 좌표 그대로의 모양 (48 단위)
    private val pStraightLine = Path().apply { moveTo(32f, 44f); lineTo(32f, 16f) }
    private val pStraightHead = Path().apply { moveTo(32f, 3f); lineTo(39f, 16f); lineTo(25f, 16f); close() }
    private val pLeftLine = Path().apply { moveTo(32f, 44f); lineTo(32f, 38f); quadTo(32f, 30f, 24f, 30f); lineTo(16f, 30f) }
    private val pStraightLeftLine = Path().apply {
        moveTo(32f, 44f); lineTo(32f, 16f)
        moveTo(32f, 39f); quadTo(32f, 30f, 24f, 30f); lineTo(16f, 30f)
    }
    private val pLeftHead = Path().apply { moveTo(4f, 30f); lineTo(16f, 23f); lineTo(16f, 37f); close() }

    private fun perRow(): Int = if (cells.size <= 6) cells.size.coerceAtLeast(1) else ceil(cells.size / 2.0).toInt()

    private val showNumbers get() = cells.any { it.number != null }
    private val numArea get() = if (showNumbers) numH else 0f

    private fun cellSize(width: Int): Float {
        fixedCellDp?.let { return dp(it) }
        val n = perRow()
        val byWidth = (width - gap * (n - 1)) / n
        return min(maxCell, byWidth)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val fixed = fixedCellDp
        val w = if (fixed != null) dp(fixed).toInt() + 1 else MeasureSpec.getSize(widthMeasureSpec)
        val size = cellSize(w)
        val rows = if (cells.isEmpty()) 0 else ceil(cells.size / perRow().toDouble()).toInt()
        val h = if (rows == 0) 0f else rows * (size + numArea) + (rows - 1) * gap
        setMeasuredDimension(w, h.toInt() + 1)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (cells.isEmpty()) return
        val n = perRow()
        val size = cellSize(width)
        val rect = RectF()
        cells.forEachIndexed { i, cell ->
            val row = i / n
            val col = i % n
            val left = col * (size + gap)
            val top = row * (size + numArea + gap)
            val cellColor = cell.color

            // 칸
            rect.set(left + border / 2, top + border / 2, left + size - border / 2, top + size - border / 2)
            val r = dp(10f)
            canvas.drawRoundRect(rect, r, r, bgPaint)
            borderPaint.color = cellColor
            canvas.drawRoundRect(rect, r, r, borderPaint)

            // 화살표 (48 좌표를 칸 안쪽에 맞춰 줄이고, 가운데 기준 회전)
            val inner = size - border * 2
            val s = inner / GRID
            for (a in cell.arrows) {
                val color = a.color
                strokePaint.color = color
                fillPaint.color = color
                canvas.save()
                canvas.translate(left + border, top + border)
                canvas.scale(s, s)
                canvas.rotate(a.rot, GRID / 2, GRID / 2)
                when (a.move) {
                    "S" -> {
                        canvas.drawPath(pStraightLine, strokePaint)
                        canvas.drawPath(pStraightHead, fillPaint)
                    }
                    "L" -> {
                        canvas.drawPath(pLeftLine, strokePaint)
                        canvas.drawPath(pLeftHead, fillPaint)
                    }
                    else -> {
                        canvas.drawPath(pStraightLeftLine, strokePaint)
                        canvas.drawPath(pStraightHead, fillPaint)
                        canvas.drawPath(pLeftHead, fillPaint)
                    }
                }
                canvas.restore()
            }

            // 원래 단계 번호
            val num = cell.number
            if (num != null) {
                numPaint.color = cellColor
                canvas.drawText(num.toString(), left + size / 2, top + size + numH - dp(2f), numPaint)
            }
        }
    }
}
